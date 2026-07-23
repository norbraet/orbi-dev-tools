# Orbi Dev Tools

Private, versioned repository automation for Orbi projects. It replaces copied
project-management scripts with a small npm-compatible command-line tool.

## Install in a project

Publish this package to your private registry, then install it with the
project's package manager:

```sh
pnpm add --save-dev @norbraet/orbi-dev-tools
# npm install --save-dev @norbraet/orbi-dev-tools
# yarn add --dev @norbraet/orbi-dev-tools
```

Copy [`templates/orbi-dev-tools.json`](templates/orbi-dev-tools.json) into the
consumer repository as `.orbi-dev-tools.json`. Projects own this configuration
and their `lefthook.yml`, `mise.toml`, and `.github/` directory.

The package includes opt-in Lefthook and mise task snippets under
[`templates/`](templates/). Merge them into the project's local files instead
of replacing application-specific hooks and tasks.

## Commands

```sh
orbi-dev-tools validate-commit-message .git/COMMIT_EDITMSG
orbi-dev-tools forbid-protected-branch --operation commit
orbi-dev-tools create-pr
orbi-dev-tools promote-release
orbi-dev-tools bootstrap-github --dry-run
```

`bootstrap-github` synchronizes the configured labels, milestones, GitHub
Project, default workflow permissions, integration branch, and branch ruleset.
Use `--dry-run` to inspect its proposed changes before applying them.

## Development

```sh
mise install
mise run setup
pnpm test
mise run check
```
