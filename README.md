# PR Dashboard

A VS Code extension that gives you a single panel to keep an eye on open pull requests
across the repositories you care about — on **GitHub.com** and **GitHub Enterprise Server**.

You choose which repos to watch; the list is persisted in VS Code's extension storage
(app data). Authentication uses VS Code's built-in GitHub OAuth — no personal access
tokens to copy around.

## Features

- List open PRs grouped per watched repo
- Add / remove repos to watch (`owner/repo` or full URL)
- PR status: CI checks, review decision, draft, mergeable/conflict
- Filter by author, reviewer, or label
- Auto-refresh on a timer + notifications when a PR newly needs your review
- "Needs my review" highlighting and quick filter

## Project layout

```
PR Dashboard/
├─ README.md            # this file
├─ Design.md            # architecture & design details
└─ app/                 # the VS Code extension (extension root)
   ├─ package.json
   ├─ src/              # extension host code (Node)
   └─ media/            # webview UI (HTML/CSS/JS)
```

## Getting started

1. Open this workspace in VS Code.
2. Install dependencies (none required for runtime; the extension uses only the VS Code API and global `fetch`).
3. Press **F5** with the `app/` folder as the extension root to launch an Extension Development Host.
   - A `.vscode/launch.json` is included that points at `app/`.
4. Run the command **PR Dashboard: Open** from the Command Palette (`Ctrl+Shift+P`).
5. The first time you fetch, VS Code will prompt you to sign in to GitHub (OAuth).

## Watching GitHub Enterprise repos

Add the full URL of the PR's repo, e.g. `https://github.mycompany.com/team/service`.
For Enterprise auth, configure VS Code's `github-enterprise.uri` setting to your GHE host.

## Settings

| Setting | Default | Description |
|---|---|---|
| `prDashboard.refreshIntervalMinutes` | `5` | Auto-refresh interval. `0` disables auto-refresh. |
| `prDashboard.notifyOnReviewRequest` | `true` | Show a notification when a PR newly needs your review. |

## Where is my data stored?

- **Watched repos** → VS Code extension global state (under app data:
  `%APPDATA%\Code\User\globalStorage\<publisher>.pr-dashboard\` on Windows).
- **OAuth token** → managed by VS Code's authentication provider in the OS secret store.
  The extension never persists tokens itself.

See [Design.md](Design.md) for the full architecture.
