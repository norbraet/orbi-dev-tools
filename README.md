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

## GitHub baseline

Run `orbi-dev-tools init-github` after setting `github.owner` and
`github.repositoryName` in `.orbi-dev-tools.json`. It creates a complete,
versioned `.github/` baseline without overwriting any existing file. Use
`--force` only when you intentionally want to replace a generated file.

The baseline includes issue forms, PR template, CODEOWNERS, Dependabot, label
definitions, milestone and project definitions, labeler configuration, and CI,
PR-title, release-please, labeler, and stale workflows. Add application- and
language-specific checks, labels, and ownership paths locally afterwards.

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

Bootstrap requires Node.js, Bash, Git, and an authenticated GitHub CLI (`gh`).
Labels are parsed with the package's runtime `yaml` dependency, so multiline,
inline, and block YAML mappings are supported. The configured labels file must
contain a `labels` array; each entry needs a nonempty string `name`, a quoted
six-digit hexadecimal `color` (without `#`), and a string `description`.
Use `labels: []` to skip labels intentionally. Invalid definitions stop bootstrap
before any GitHub changes. Dry-run prints label commands without applying them.

The default branch ruleset requires `Quality checks` and `conventional-title`,
matching the generated CI and PR-title workflows. If you rename those jobs or
add application checks, set `github.requiredStatusChecks` in
`.orbi-dev-tools.json` to the complete list of required check names. This list
replaces the defaults; use the job's `name`, or its job ID when no name is set.
For example:

```json
{
  "github": {
    "requiredStatusChecks": ["Quality checks", "conventional-title", "Integration tests"]
  }
}
```

Inspect the ruleset JSON with `bootstrap-github --dry-run`, then run bootstrap
without `--dry-run` to apply the updated requirements. When invoking the Bash
script directly, pass the list as JSON in `ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS`.

## Development

```sh
mise install
mise run setup
pnpm test
mise run check
```
