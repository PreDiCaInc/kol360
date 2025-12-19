# Claude Session Notes

## GitHub CLI (gh) Setup

The gh CLI is installed at `/usr/local/bin/gh`.

### Creating Pull Requests

To create PRs, use the GitHub token with the GH_TOKEN environment variable:

```bash
GH_TOKEN=<token> gh pr create --title "PR Title" --body "PR Body" --base main --repo PreDiCaInc/kol360
```

**Note:** Ask the user for the GitHub token if needed. Do not store tokens in committed files.

## Repository Info
- Owner: PreDiCaInc
- Repo: kol360
- Main branch: main
