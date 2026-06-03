# Change Log

All notable changes to the **PR Dashboard** extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-03

### Added
- Activity Bar view listing the repositories you choose to watch.
- Pull Requests panel showing open PRs across all watched repos.
- Support for **GitHub.com**, **GitHub Enterprise Server**, and **Azure DevOps**.
- Add/remove repos via `owner/repo` or a full repository URL.
- PR status indicators: CI checks, review decision, draft, and mergeable/conflict.
- Filter by author, reviewer, or label, plus a "Needs my review" quick filter.
- Auto-refresh on a configurable timer with notifications when a PR newly needs
  your review.
- Authentication through VS Code's built-in OAuth providers (no personal access
  tokens to manage).
