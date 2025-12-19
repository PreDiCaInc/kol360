# Claude Session Notes

## GitHub CLI (gh) Setup

The gh CLI is installed at `/usr/local/bin/gh`.

### Creating Pull Requests

The GitHub token is set in `~/.bashrc` as `GH_TOKEN`. To use it:

```bash
source ~/.bashrc
gh pr create --title "PR Title" --body "PR Body" --base main --repo PreDiCaInc/kol360
```

Or if GH_TOKEN isn't available, ask the user for the token and use:

```bash
GH_TOKEN=<token> gh pr create --title "PR Title" --body "PR Body" --base main --repo PreDiCaInc/kol360
```

## Repository Info
- Owner: PreDiCaInc
- Repo: kol360
- Main branch: main
