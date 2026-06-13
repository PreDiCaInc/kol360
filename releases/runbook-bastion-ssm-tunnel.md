# Runbook — bastion tunnel via SSM Session Manager

**Set up:** 2026-06-11.
**Purpose:** A second transport for the kol360 bastion tunnel that works on networks that block outbound port 22 (cellular hotspots, restrictive corporate / airport wifi). Uses AWS SSM Session Manager port-forwarding over HTTPS/443.

The original `scripts/tunnel-up.sh` (SSH/`:22`) is still the default for normal use. SSM is the fallback when SSH can't connect — same end-result (`localhost:5432` → bastion → RDS), different transport.

---

## What was provisioned (AWS-side, one-time)

| Resource | Identifier | Purpose |
|---|---|---|
| IAM role | `kol360-bastion-ssm-role` (ARN: `arn:aws:iam::163859990568:role/kol360-bastion-ssm-role`) | Lets the bastion EC2 register with SSM |
| IAM instance profile | `kol360-bastion-ssm-profile` | Wrapper that attaches the role to the EC2 |
| Managed policy attached | `arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore` | Standard AWS-provided policy with the SSM agent permissions |
| Bastion EC2 association | `i-092c65a198078b35f` ← `kol360-bastion-ssm-profile` | The instance profile is attached. |
| SSM agent status | `Online`, version `3.3.3050.0` (Amazon Linux default) | Confirmed via `aws ssm describe-instance-information` |

Verify any time with:
```bash
aws ssm describe-instance-information \
  --region us-east-2 --profile koluser \
  --filters "Key=InstanceIds,Values=i-092c65a198078b35f" \
  --query 'InstanceInformationList[*].{Ping:PingStatus,Agent:AgentVersion,Platform:PlatformName}'
```

`PingStatus` of `Online` means the bastion can be used as an SSM target. `Online` → `ConnectionLost` after a few minutes means the agent died (reboot the bastion or check `/var/log/amazon/ssm/amazon-ssm-agent.log`).

---

## What each developer needs (one-time, local)

```bash
# On Mac
brew install --cask session-manager-plugin     # asks for sudo password
session-manager-plugin --version                # → 1.2.814.0 (or newer)
```

That's it. No AWS-side setup per-developer beyond the koluser profile, which everyone already has.

---

## Using the tunnel — wrapper script

```bash
PGPASSWORD=RDS4Bioexec2025 scripts/tunnel-up-ssm.sh         # test DB → localhost:5432 (default)
PGPASSWORD=RDS4Bioexec2025 scripts/tunnel-up-ssm.sh test    # same
PGPASSWORD=RDS4Bioexec2025 scripts/tunnel-up-ssm.sh prod    # prod DB → localhost:5433
```

Behaviour:
- Idempotent psql probe — if a tunnel is already up (SSH or SSM, doesn't matter), short-circuits with "✓ tunnel already up".
- Checks `session-manager-plugin` is installed; fails fast (exit 4) with the brew command if not.
- Checks the bastion is `Online` in SSM; fails fast (exit 2) if the agent disconnected.
- Bails if local port is held by an unrelated process (exit 1) instead of fighting it.
- Background-runs the session; writes the PID to `/tmp/kol360-ssm-tunnel-${PORT}.pid` for teardown.
- Waits up to 20s for the port to start serving, then verifies with a real psql round-trip before exiting 0.

Teardown:
```bash
kill $(cat /tmp/kol360-ssm-tunnel-5432.pid)        # test
kill $(cat /tmp/kol360-ssm-tunnel-5433.pid)        # prod
```

---

## The raw command (if you want to skip the wrapper)

```bash
aws ssm start-session \
  --region us-east-2 --profile koluser \
  --target i-092c65a198078b35f \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters host="kol360-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com",portNumber="5432",localPortNumber="5432"
```

Replaces `kol360-db…` with `kol360-db-prod.czkyi4mem2bj.us-east-2.rds.amazonaws.com` and `localPortNumber=5433` for prod. Foregrounds the session (Ctrl-C to close).

---

## When to use SSM vs SSH

| Network | Use |
|---|---|
| Home wifi (Comcast etc.) — outbound :22 open | SSH (default). It's slightly faster to establish (~1s vs ~3-5s for SSM). |
| Cellular hotspot (T-Mobile / Verizon CGNAT) — :22 often blocked | **SSM.** |
| Corporate / airport / hotel wifi — :22 often blocked | **SSM.** |
| Anywhere the bastion sshd has wedged (rare) | **SSM** doesn't depend on sshd. |

If you're not sure, run the SSH wrapper first; it exits cleanly with code 2 if `:22` is unreachable, then run the SSM wrapper.

---

## Troubleshooting

### `session-manager-plugin not found`
Install it (see "What each developer needs" above).

### `bastion not Online in SSM (PingStatus=ConnectionLost)`
The SSM agent on the bastion stopped responding. Most likely fix: reboot the bastion.
```bash
aws ec2 reboot-instances --region us-east-2 --profile koluser --instance-ids i-092c65a198078b35f
```
The agent restarts on boot and re-registers within ~1-2 min.

### `bastion not Online in SSM (PingStatus=None)`
The instance profile isn't attached or the SSM agent isn't installed. Re-verify:
```bash
aws ec2 describe-instances --region us-east-2 --profile koluser \
  --instance-ids i-092c65a198078b35f \
  --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn'
# Expected: arn:aws:iam::163859990568:instance-profile/kol360-bastion-ssm-profile
```

### `SSM session started but psql couldn't connect within 20s`
Check the SSM session log at `/tmp/kol360-ssm-tunnel-${PORT}.log`. Common cause: another process briefly held the local port. The wrapper bails before starting if that's the case, but races are possible. Re-run.

### Need to clean up dangling sessions
```bash
pkill -f "session-manager-plugin"
pkill -f "aws ssm start-session"
```
This kills every active SSM session belonging to your user. Safe in normal dev use.

---

## What this does NOT do

- **Does not replace the SSH tunnel for the prod team's deploy / migrate runbooks.** Those scripts already use SSH and have been audited that way. SSM is a developer convenience.
- **Does not change IP whitelisting or security groups.** SSM uses HTTPS to the regional SSM endpoint, not to the bastion directly. The bastion's `:22` SG entries are still relevant for SSH users; SSM ignores them.
- **Does not give anyone new access TO the bastion.** The instance profile only lets the bastion CALL OUT to SSM. The "who can `start-session` against this bastion" question is governed by the caller's IAM permissions (`koluser`), which were already in place.

---

## How to undo (if ever needed)

```bash
# Detach the instance profile from the bastion
ASSOC=$(aws ec2 describe-iam-instance-profile-associations \
  --region us-east-2 --profile koluser \
  --filters "Name=instance-id,Values=i-092c65a198078b35f" \
  --query 'IamInstanceProfileAssociations[0].AssociationId' --output text)
aws ec2 disassociate-iam-instance-profile \
  --region us-east-2 --profile koluser \
  --association-id "$ASSOC"

# Tear down the instance profile + role
aws iam remove-role-from-instance-profile \
  --profile koluser \
  --instance-profile-name kol360-bastion-ssm-profile \
  --role-name kol360-bastion-ssm-role
aws iam delete-instance-profile \
  --profile koluser \
  --instance-profile-name kol360-bastion-ssm-profile
aws iam detach-role-policy \
  --profile koluser \
  --role-name kol360-bastion-ssm-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam delete-role \
  --profile koluser \
  --role-name kol360-bastion-ssm-role
```

Bastion goes back to SSH-only. No SSH config changes are needed; the SSH path was never disturbed.
