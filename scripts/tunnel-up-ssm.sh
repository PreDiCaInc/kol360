#!/usr/bin/env bash
#
# tunnel-up-ssm.sh — bastion tunnel via AWS SSM Session Manager.
#
# Same end-result as scripts/tunnel-up.sh: localhost:5432 (or 5433)
# forwards to the kol360 RDS via the bastion EC2. Difference is the
# transport — this script uses SSM port-forwarding over HTTPS/443,
# which works on networks that block outbound :22 (cellular hotspots,
# restrictive corp/airport wifi, etc.).
#
# Setup pre-reqs (one-time, already done on this Mac on 2026-06-11):
#   - Bastion EC2 has an IAM instance profile with the
#     AmazonSSMManagedInstanceCore managed policy attached.
#     (kol360-bastion-ssm-profile in this account.)
#   - aws-cli session-manager-plugin installed locally:
#       brew install --cask session-manager-plugin
#   - The caller's IAM principal (koluser) has ssm:StartSession
#     against the bastion (default with AdministratorAccess).
#
# Usage:
#   scripts/tunnel-up-ssm.sh             # test DB (default)
#   scripts/tunnel-up-ssm.sh test
#   scripts/tunnel-up-ssm.sh prod
#
# Exit codes:
#   0 — tunnel up and psql round-trip succeeded
#   1 — local port held by a non-tunnel process
#   2 — bastion not registered with SSM (PingStatus != Online)
#   3 — SSM session started but psql verification failed
#   4 — session-manager-plugin not installed
#   5 — DB password (PGPASSWORD) not exported
#
# Backgrounds the session (like ssh -f) and writes the PID to
# /tmp/kol360-ssm-tunnel-${LOCAL_PORT}.pid for later teardown.
# Already-running session is detected via the same psql probe the
# ssh wrapper uses — re-runs are safe.

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

BASTION_ID="i-092c65a198078b35f"
AWS_PROFILE="${AWS_PROFILE:-koluser}"
AWS_REGION="${AWS_REGION:-us-east-2}"
DB_USER="kol360admin"
DB_PASSWORD="${PGPASSWORD:-}"
DB_NAME="kol360"
PID_FILE="/tmp/kol360-ssm-tunnel-${LOCAL_PORT}.pid"

log()  { printf "\033[36m[tunnel-up-ssm]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[tunnel-up-ssm]\033[0m %s\n" "$*" >&2; }
err()  { printf "\033[31m[tunnel-up-ssm]\033[0m %s\n" "$*" >&2; }

if [ -z "$DB_PASSWORD" ]; then
  err "PGPASSWORD not set — export it first"
  err "  See docs/team-notes/cdteam-aws-access-handoff.md for the value"
  exit 5
fi

log "env=$ENV_NAME local=$LOCAL_PORT rds=$RDS_HOST (transport=SSM)"

# --- 1. Already up? psql probe catches our own tunnel + anyone else's. ---
if PGPASSWORD="$DB_PASSWORD" psql -h localhost -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" -tA >/dev/null 2>&1; then
  log "✓ tunnel already up — psql round-trip succeeded on localhost:${LOCAL_PORT}"
  exit 0
fi

# --- 2. Plugin sanity ---
if ! command -v session-manager-plugin >/dev/null 2>&1; then
  err "session-manager-plugin not installed."
  err "  brew install --cask session-manager-plugin"
  exit 4
fi

# --- 3. Bastion online in SSM? ---
PING=$(aws ssm describe-instance-information \
  --region "$AWS_REGION" --profile "$AWS_PROFILE" \
  --filters "Key=InstanceIds,Values=${BASTION_ID}" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text 2>/dev/null || true)
if [ "$PING" != "Online" ]; then
  err "bastion not Online in SSM (PingStatus=${PING:-None})."
  err "  Check the kol360-bastion-ssm-profile is attached to the EC2 +"
  err "  the SSM agent is running on the bastion."
  exit 2
fi
log "✓ bastion Online in SSM"

# --- 4. Local port held by something else? Bail rather than fight. ---
PORT_HOLDER=$(lsof -ti :"$LOCAL_PORT" 2>/dev/null | head -1)
if [ -n "$PORT_HOLDER" ]; then
  HOLDER_CMD=$(ps -p "$PORT_HOLDER" -o comm= 2>/dev/null || echo "?")
  err "local port $LOCAL_PORT held by pid $PORT_HOLDER ($HOLDER_CMD)"
  err "  kill it or pick a different port"
  exit 1
fi

# --- 5. Start the SSM session in the background ---
LOG_FILE="/tmp/kol360-ssm-tunnel-${LOCAL_PORT}.log"
log "starting SSM port-forward: localhost:${LOCAL_PORT} → ${RDS_HOST}:5432"
aws ssm start-session \
  --region "$AWS_REGION" --profile "$AWS_PROFILE" \
  --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=${RDS_HOST},portNumber=5432,localPortNumber=${LOCAL_PORT}" \
  >"$LOG_FILE" 2>&1 &
SSM_PID=$!
echo "$SSM_PID" > "$PID_FILE"
log "session pid=$SSM_PID (log: $LOG_FILE, kill: kill \$(cat $PID_FILE))"

# --- 6. Wait for the port to be listening (SSM takes ~3-5s to settle) ---
for i in $(seq 1 20); do
  if PGPASSWORD="$DB_PASSWORD" psql -h localhost -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" -tA >/dev/null 2>&1; then
    log "✓ tunnel up and verified — ${ENV_NAME} DB on localhost:${LOCAL_PORT}"
    exit 0
  fi
  sleep 1
done

err "SSM session started but psql couldn't connect within 20s."
err "  Check $LOG_FILE for SSM session errors."
err "  Session pid $SSM_PID still alive — kill with: kill $SSM_PID"
exit 3
