# PR Dashboard

Keep an eye on open **pull requests** across the repositories you care about —
without leaving VS Code. Works with **GitHub.com**, **GitHub Enterprise Server**,
and **Azure DevOps**.

You choose which repos to watch; the list is persisted in VS Code's extension
storage. Authentication uses VS Code's built-in OAuth — no personal access tokens
to copy around.

## Features

- **One panel for every repo** — open PRs grouped per watched repository.
- **Multi-host** — GitHub.com, GitHub Enterprise Server, and Azure DevOps in the
  same list.
- **Add / remove repos** with `owner/repo` or a full repository URL.
- **Rich PR status** — CI checks, review decision, draft, and mergeable/conflict.
- **Filters** — by author, reviewer, or label.
- **"Needs my review"** highlighting, quick filter, and optional notifications.
- **Auto-refresh** on a configurable timer.

## Getting started

1. Install the extension and open the **PR Dashboard** view from the Activity Bar.
2. Click **Add Repository…** and enter an `owner/repo` or a full URL:
   - GitHub: `microsoft/vscode` or `https://github.com/microsoft/vscode`
   - GitHub Enterprise: `https://github.mycompany.com/team/service`
   - Azure DevOps: `https://dev.azure.com/org/project/_git/repo`
3. The first time you fetch, VS Code prompts you to sign in (OAuth).

### GitHub Enterprise

For Enterprise auth, set VS Code's `github-enterprise.uri` setting to your GHE host.

### Azure DevOps

Sign-in uses VS Code's built-in Microsoft account provider.

## Settings

| Setting | Default | Description |
|---|---|---|
| `prDashboard.refreshIntervalMinutes` | `5` | Auto-refresh interval. `0` disables auto-refresh. |
| `prDashboard.notifyOnReviewRequest` | `true` | Show a notification when a PR newly needs your review. |

## Privacy & data

- **Watched repos** are stored in VS Code's extension global state.
- **OAuth tokens** are managed by VS Code's authentication providers in the OS
  secret store. The extension never persists tokens itself.

## License

[MIT](LICENSE)
