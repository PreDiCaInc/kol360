#!/usr/bin/env bash
#
# tunnel-up.sh — idempotent SSH tunnel to the kol360 RDS via bastion.
#
# Why this exists:
#   Bringing up the tunnel manually has too many fail modes — already up, IP
#   not whitelisted, carrier blocks outbound :22, .pem path wrong, sleep killed
#   the previous tunnel, etc. This script collapses them into one command that
#   either gets you connected or tells you exactly which fail mode you're in.
#
# Convention (per docs/team-notes/cdteam-aws-access-handoff.md):
#   - Local port 5432 → kol360-db (test RDS)
#   - Local port 5433 → kol360-db-prod (prod RDS)
#
# Usage:
#   scripts/tunnel-up.sh             # test DB (default)
#   scripts/tunnel-up.sh test
#   scripts/tunnel-up.sh prod
#
# Exit codes:
#   0 — tunnel up and psql round-trip succeeded
#   1 — already-up check found something on the local port that isn't our tunnel
#   2 — bastion TCP unreachable (carrier block, network down, bastion stopped)
#   3 — SSH succeeded but psql verification failed
#   4 — couldn't determine current public IP
#   5 — SG add failed (likely IAM permission issue)
#
# Safe to re-run. If the tunnel is already up and healthy, it returns 0
# without changing anything. If the local port is bound by a non-tunnel
# process (e.g. local Postgres), it bails with exit 1.

set -u
set -o pipefail

ENV_NAME="${1:-test}"
case "$ENV_NAME" in
  test)
    LOCAL_PORT=5432
    RDS_HOST="kol360-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com"
    ;;
  prod)
    LOCAL_PORT=5433
    RDS_HOST="kol360-db-prod.czkyi4mem2bj.us-east-2.rds.amazonaws.com"
    ;;
  *)
    echo "Usage: $0 [test|prod]" >&2
    exit 64
    ;;
esac

# v1.17.31: env-var-ize bastion host + DB password so the script is
# safe-to-ship across the PreDiCaInc → Bio-Exec mirror without manual
# stripping. Background: docs/findings/tunnel-script-cred-hardening-2026-06-09.md.
#
# Both can be overridden by env. Defaults below preserve the dev
# experience (no extra setup) but require an AWS lookup for the
# bastion IP if not exported. Devs typically `export PGPASSWORD=...`
# once in their shell rc (it's the standard psql env var).
#
# To override: `export BASTION_IP=...` and `export PGPASSWORD=...`
# in your shell before running, or pass inline:
#   BASTION_IP=x.x.x.x PGPASSWORD=secret scripts/tunnel-up.sh
BASTION_IP="${BASTION_IP:-}"
BASTION_USER="ec2-user"
KEY_PATH="${KOL360_BASTION_KEY:-$(cd "$(dirname "$0")/.." && pwd)/kol360-bastion-key.pem}"
BASTION_SG="sg-023bbc371eb51c2e2"
AWS_PROFILE="${AWS_PROFILE:-koluser}"
AWS_REGION="${AWS_REGION:-us-east-2}"
DB_USER="kol360admin"
DB_NAME="kol360"

# Resolve bastion IP from EC2 if not in env. Cached for the run.
if [ -z "$BASTION_IP" ]; then
  BASTION_IP=$(aws ec2 describe-instances \
    --instance-ids i-092c65a198078b35f \
    --region "$AWS_REGION" --profile "$AWS_PROFILE" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text 2>/dev/null)
  if [ -z "$BASTION_IP" ] || [ "$BASTION_IP" = "None" ]; then
    printf "\033[31m[tunnel-up]\033[0m couldn't resolve bastion IP — set BASTION_IP env var\n" >&2
    exit 6
  fi
fi

# DB password from env (PGPASSWORD is the standard psql env var, so a
# single export covers both this script and direct psql sessions).
DB_PASSWORD="${PGPASSWORD:-}"
if [ -z "$DB_PASSWORD" ]; then
  printf "\033[31m[tunnel-up]\033[0m PGPASSWORD not set — export it first\n" >&2
  printf "  See docs/team-notes/cdteam-aws-access-handoff.md for the value\n" >&2
  exit 7
fi

log()  { printf "\033[36m[tunnel-up]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[tunnel-up]\033[0m %s\n" "$*" >&2; }
err()  { printf "\033[31m[tunnel-up]\033[0m %s\n" "$*" >&2; }

log "env=$ENV_NAME local=$LOCAL_PORT rds=$RDS_HOST"

# --- 1. Already up? ---
# Primary check: can psql round-trip through localhost:LOCAL_PORT?
# This catches the "another team / another user / another shell already
# brought up the tunnel" case — pgrep alone would miss tunnels owned by
# a different uid. If psql works, we're done regardless of who set it up.
if PGPASSWORD="$DB_PASSWORD" psql -h localhost -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" -tA >/dev/null 2>&1; then
  log "✓ tunnel already up — psql round-trip succeeded on localhost:${LOCAL_PORT}"
  log "(reusing existing tunnel; not starting a second one)"
  exit 0
fi

# psql failed. Two sub-cases:
#  (a) port is bound but not serving — maybe our own stale ssh process, or a
#      non-tunnel process squatting. Clean up if it's ours; bail if it isn't.
#  (b) port is free — fall through to the bastion-up path below.
STALE_TUNNEL=$(pgrep -f "ssh.*-L *${LOCAL_PORT}:${RDS_HOST}:5432" 2>/dev/null || true)
if [ -n "$STALE_TUNNEL" ]; then
  warn "found our own ssh process (pid $STALE_TUNNEL) but psql failed — killing stale tunnel"
  kill "$STALE_TUNNEL" 2>/dev/null || true
  sleep 1
fi

PORT_HOLDER=$(lsof -ti :"$LOCAL_PORT" 2>/dev/null | head -1)
if [ -n "$PORT_HOLDER" ]; then
  HOLDER_CMD=$(ps -p "$PORT_HOLDER" -o comm= 2>/dev/null || echo "?")
  err "local port $LOCAL_PORT held by pid $PORT_HOLDER ($HOLDER_CMD), but psql can't talk to it"
  err "if that's another user's tunnel pointing at a different DB, ask them to drop it"
  err "or pick a different local port"
  exit 1
fi

# --- 2. Can we reach the bastion at all (TCP layer)? ---
# Distinguishes carrier port-22 block from "we just need an SG add."
log "checking TCP to bastion ${BASTION_IP}:22"
if ! nc -z -w 5 "$BASTION_IP" 22 2>/dev/null; then
  err "TCP to ${BASTION_IP}:22 timed out"
  err "this is BEFORE the SSH handshake — carrier likely blocks outbound :22,"
  err "or you're on a network without route to that host."
  err "switch networks (try home wifi) and re-run."
  exit 2
fi
log "✓ bastion TCP reachable"

# --- 3. SG check + add-if-missing ---
MY_IP=$(curl -s --max-time 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '\n[:space:]')
if [ -z "$MY_IP" ]; then
  err "couldn't determine public IP (checkip.amazonaws.com unreachable)"
  exit 4
fi
log "public IP: $MY_IP"

# Check existing SG entries for our IP. Approach: list ALL CIDRs whitelisted
# on port 22 as separate lines, then grep for exact /32 match. Earlier
# revision used a nested JMESPath filter (IpRanges[?CidrIp==...]) which
# returned empty even when the rule existed — flatten + grep is robust.
ALL_CIDRS=$(aws ec2 describe-security-groups \
  --region "$AWS_REGION" --profile "$AWS_PROFILE" \
  --group-ids "$BASTION_SG" \
  --query "SecurityGroups[].IpPermissions[?ToPort==\`22\`].IpRanges[].CidrIp" \
  --output text 2>/dev/null | tr '\t' '\n' || true)

if echo "$ALL_CIDRS" | grep -Fxq "${MY_IP}/32"; then
  log "✓ ${MY_IP}/32 already in SG"
else
  log "adding ${MY_IP}/32 to bastion SG (port 22)"
  DESC="${USER:-$(whoami)} @ $(hostname -s) $(date +%Y-%m-%d)"
  # Capture stderr so we can recognize the "duplicate" case as success
  # (race: someone else just added it, or a /N range covers us).
  ADD_OUT=$(aws ec2 authorize-security-group-ingress \
       --region "$AWS_REGION" --profile "$AWS_PROFILE" \
       --group-id "$BASTION_SG" \
       --ip-permissions "[{\"IpProtocol\":\"tcp\",\"FromPort\":22,\"ToPort\":22,\"IpRanges\":[{\"CidrIp\":\"${MY_IP}/32\",\"Description\":\"${DESC}\"}]}]" \
       2>&1)
  ADD_RC=$?
  if [ $ADD_RC -eq 0 ]; then
    log "✓ SG rule added: ${MY_IP}/32"
  elif echo "$ADD_OUT" | grep -q "InvalidPermission.Duplicate"; then
    log "✓ ${MY_IP}/32 already in SG (detected via add-attempt)"
  else
    err "SG add failed:"
    err "$ADD_OUT"
    exit 5
  fi
fi

# --- 4. Bring up the tunnel ---
if [ ! -r "$KEY_PATH" ]; then
  err "bastion key not readable at $KEY_PATH"
  exit 2
fi

log "starting tunnel: localhost:${LOCAL_PORT} → ${RDS_HOST}:5432"
ssh -i "$KEY_PATH" \
    -L "${LOCAL_PORT}:${RDS_HOST}:5432" \
    "${BASTION_USER}@${BASTION_IP}" \
    -N -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -f

# Brief settle window for ssh -f to background and bind the local port.
sleep 2

# --- 5. Verify with psql ---
log "verifying with psql"
if PGPASSWORD="$DB_PASSWORD" psql -h localhost -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" \
     -c "SELECT current_database(), inet_server_addr();" -tA 2>&1; then
  log "✓ tunnel up and verified — ${ENV_NAME} DB on localhost:${LOCAL_PORT}"
  exit 0
else
  err "tunnel started but psql couldn't connect — check upstream RDS status"
  exit 3
fi
