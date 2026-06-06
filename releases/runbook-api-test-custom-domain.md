# Runbook — provision `api-test.bio-exec.com` for kol360-api-test

**Status:** AWS-side associate-custom-domain started 2026-06-05. Waiting on three DNS CNAME records at the bio-exec.com DNS provider before AWS can finish certificate validation.

**Why:** Curation integration ([POST /api/v1/hcps/get-beid](../apps/api/src/routes/curation.ts)) needs a clean URL. Curation team's calling code currently has a `https://koltest.bio-exec.com/hcps/...` placeholder that 404s (wrong host — that's the web service, not the API). The fix is a custom domain on the API App Runner service.

Same pattern as the existing `koltest.bio-exec.com` web custom domain — that one is already `active` per `aws apprunner describe-custom-domains` and provides the reference for record shapes.

---

## Records to add at bio-exec.com DNS

DNS for bio-exec.com is managed **outside the Bio-Exec AWS account** (`163859990568`) — `aws route53 list-hosted-zones --profile koluser` returns empty. Pteam owns the registrar/provider relationship. Three CNAMEs:

| # | Type | Name (FQDN) | Value | Purpose |
|---|---|---|---|---|
| 1 | CNAME | `api-test.bio-exec.com.` | `mpcu4inmtj.us-east-2.awsapprunner.com.` | Routes the custom domain to the App Runner service |
| 2 | CNAME | `_ab12803afd8926ba5828bbf24e88e309.api-test.bio-exec.com.` | `_e97394a616e1a3056daab6f6d73a10f3.jkddzztszm.acm-validations.aws.` | ACM certificate validation (DNS-01) |
| 3 | CNAME | `_fa30b103bb3e67530e6340c06743d153.9ro4a6tk4h130ivj7n1wi2six9weu3v.api-test.bio-exec.com.` | `_d5bdb9c749c640f315d4ea2dd586478e.jkddzztszm.acm-validations.aws.` | ACM certificate validation (DNS-01) |

Records #2 and #3 are the cert-validation challenge. They can stay forever — AWS re-uses them at cert renewal time.

TTL: 300 (5 minutes) is fine; matches the convention for the existing koltest records.

---

## Verification timeline

1. **Add the 3 CNAMEs.** Once #2 and #3 propagate (usually <5 min on most providers), ACM completes cert validation. Status will move from `pending_certificate_dns_validation` → `active`.
2. **Verify cert validation:**
   ```bash
   aws apprunner describe-custom-domains \
     --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api-test/bcc7d66db0844252adfc0284464719ea" \
     --region us-east-2 --profile koluser \
     --query 'CustomDomains[?DomainName==`api-test.bio-exec.com`].Status' \
     --output text
   # Expect: active
   ```
3. **Smoke the URL:**
   ```bash
   curl -s https://api-test.bio-exec.com/health
   # Expect: {"status":"ok","version":"1.17.XX", ...}
   ```

If `Status` sticks at `pending_certificate_dns_validation` for >30 minutes, the cert-validation CNAMEs (#2 and #3) probably didn't propagate. Test:
```bash
dig +short _ab12803afd8926ba5828bbf24e88e309.api-test.bio-exec.com CNAME
# Expect: _e97394a616e1a3056daab6f6d73a10f3.jkddzztszm.acm-validations.aws.
```

---

## What we'll need on App Runner before the curation integration goes live

The curation route validates Cognito M2M tokens against a separate client. The verifier reads the client ID from an env var that doesn't exist on the App Runner service yet:

| Env var | Value | Where it comes from |
|---|---|---|
| `COGNITO_CURATION_M2M_CLIENT_ID` | `5ml2abmii9ot8eesu6birg5dmq` | Curation team's M2M client; documented in [kolcuration/spec/dba-reply-cognito-service-accounts-done.md](https://github.com/PreDiCaInc/kol-curation-platform/blob/main/spec/dba-reply-cognito-service-accounts-done.md) |

Add it to `kol360-api-test` App Runner runtime env. The service auto-restarts on env-var changes (~3 min). After restart, `curl /health` should still return `1.17.29+` (no behavior change for non-M2M routes; new env var only).

---

## Curation team status

After both steps above complete, reply to curation per the [draft reply](https://github.com/PreDiCaInc/kol-curation-platform/blob/main/spec/dba-reply-kol360-get-beid-koltest.md):

> `api-test.bio-exec.com` is live. Smoke `curl -X POST https://api-test.bio-exec.com/api/v1/hcps/get-beid` per your 2a/2b/2c checklist. Local `BE-9XXXXX` fallback can be turned off.

They can flip off their local fallback the moment `/health` returns `1.17.29+` on the custom domain.
