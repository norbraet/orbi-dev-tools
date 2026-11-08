# Orbi Dev Tools

Public, versioned repository automation for Orbi projects. It replaces copied
project-management scripts with a small npm-compatible command-line tool.

## Install in a project

The package is configured for public distribution on npmjs.com. After the first
`0.1.0` release is published, install an exact version with your project's
package manager. Public installation does not require an npm account or token:

```sh
pnpm add --save-dev --save-exact @norbraet/orbi-dev-tools@0.1.0
# npm install --save-dev --save-exact @norbraet/orbi-dev-tools@0.1.0
# yarn add --dev --exact @norbraet/orbi-dev-tools@0.1.0
```

Copy [`templates/orbi-dev-tools.json`](templates/orbi-dev-tools.json) into the
consumer repository as `.orbi-dev-tools.json`. Projects own this configuration
and their `lefthook.yml`, `mise.toml`, and `.github/` directory.

The package includes opt-in Lefthook and mise task snippets under
[`templates/`](templates/). Merge them into the project's local files instead
of replacing application-specific hooks and tasks.

Commit the manifest and lockfile. Upgrade a project deliberately by repeating
the install command with a newer exact version. Package upgrades update the
CLI and its template sources; they do not migrate files already generated in
the consuming project.

Before the registry is ready, run `npm pack` in this toolkit repository and
install the resulting `.tgz` with `pnpm add --save-dev /path/to/package.tgz`
(or `npm install --save-dev /path/to/package.tgz`). This installs the real
package contents and runtime dependencies without publishing anything.

## Set up a consuming repository

Use Node.js 22 or newer. GitHub commands also need Git and an authenticated
GitHub CLI: run `gh auth login` and `gh auth status`. Bootstrap needs permission
to manage repository settings, labels, milestones, and the owner's Projects.
Registry credentials and GitHub credentials are separate and stay outside
`.orbi-dev-tools.json`.

The shell examples use Bash. On Windows, use Git Bash and ensure `node`, `git`,
and `gh` are available in that shell. Install mise and Lefthook if you want the
provided task and hook integrations; they are external tools, not npm runtime
dependencies of this package.

1. Install the package, then copy
   `node_modules/@norbraet/orbi-dev-tools/templates/orbi-dev-tools.json` to
   `.orbi-dev-tools.json`. Set `github.owner`, `github.repositoryName`, and
   `github.projectName` to your repository's values.
2. Merge `templates/lefthook.yml` from the installed package into the project's
   `lefthook.yml`. Merge `templates/mise.tasks.toml` into `mise.toml`. Use the
   project's own tool versions and preserve existing hooks and tasks.
3. Run `lefthook install` once in the consumer repository. It installs the
   commit-message validator and protected-branch commit/push guards from the
   local configuration. Run it again in new clones after installing dependencies.
4. Run `pnpm exec orbi-dev-tools init-github` to generate the GitHub baseline.
   Review the generated files, adjust ownership and application checks, and
   commit them on an issue branch rather than a protected branch.
5. Run `pnpm exec orbi-dev-tools bootstrap-github --dry-run` to inspect the
   planned changes, then run it without `--dry-run` when ready to apply them.
   Bootstrap enables Discussions, sets workflow permissions, creates the
   integration branch from the existing release branch when missing, makes
   integration the default branch, and configures the branch ruleset.

The generated CI assumes the consuming project defines `mise run setup` and
`mise run check`. For a pnpm project, setup can run
`pnpm install --frozen-lockfile`; check should run the application's actual
checks, such as `pnpm test`. The supplied task snippet only adds toolkit tasks.
For npm projects, replace `pnpm exec orbi-dev-tools` with
`npm exec -- orbi-dev-tools`; for Yarn use `yarn orbi-dev-tools`. Adapt dependency
installation and application check tasks to the same package manager.

The default integration branch is `develop`, release branch is `main`, and
protected branches are `main`, `master`, and `develop`. If you change branch
names, update `branches.protected` explicitly as well. Configuration is loaded
from the nearest `.orbi-dev-tools.json` in the current directory or its parents;
missing settings use defaults and explicitly configured arrays replace defaults.

## Create your first pull request

With the baseline in place and the integration branch available locally:

```sh
git fetch origin
git switch develop
git pull --ff-only
git switch -c feat/123-add-example
# Make your changes, then stage the files you intend to include.
git commit -m "feat(123): add example"
git push -u origin HEAD
pnpm exec orbi-dev-tools create-pr --draft
```

If `develop` has no local branch yet, create it with
`git switch --track origin/develop`. Replace `123` with the related issue
number and use your configured integration branch. By default, PR branches
must use `type/<issue-number>-<description>`. The CLI uses the latest valid
Conventional Commit title (or a title derived from the branch), inserts the
branch issue link and commit list into the PR template, and targets integration.
Keep the local base branch current because the commit list uses `<base>..HEAD`.
Use `--base <branch>` to choose another base; remaining options are forwarded
to `gh pr create`.

Use `mise run pr:create` for the equivalent task, or
`mise run release:promote` to open the integration-to-release promotion PR.
Promotion opens a PR; it does not merge or publish a package. Complete the
consumer release-please setup and `RELEASE_PLEASE_TOKEN` configuration before
relying on generated release automation (tracked in #8).

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

Milestone and Project parsing currently expects the structure shown in the
shipped templates: double-quoted milestone titles/descriptions, plain Project
title/description values, a `readme: |` block followed by `fields:`, and inline
option lists under `fields:` followed by `workflows:`. LF and CRLF files work.
Keep that layout when editing these two files. Project fields are created when
missing; existing field options are left unchanged. Project views and built-in
workflows listed in the template require manual setup in GitHub.

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

Use the versions in `mise.toml`, or Node.js 22.13+ / 24 for development with
ESLint 10. The published CLI still supports Node.js 22+; ESLint is a development
dependency and is not installed when a project consumes this package.

```sh
mise install
mise run setup
pnpm run lint
pnpm test
mise run check
npm run test:package
```

`pnpm run lint` (or `mise run lint`) uses ESLint's recommended JavaScript rules
for Node ES modules in `bin/`, `src/`, `scripts/`, and `test/`, plus the ESLint
configuration itself. It reports parse errors, undefined names, unused variables,
and other suspicious patterns; it does not enforce formatting or declaration
placement. Declarations may stay near the top of a function/block, but initializers
that perform file reads or execute commands must run after their prerequisites.
`pnpm run check` runs linting and tests, and is the same entry point used by mise
and CI. npm's `prepublishOnly` invokes that check and the separate npm package
smoke check before publication. ESLint replaces the former custom syntax-check
script; tests and the package smoke check still verify actual behavior.

`mise run setup` installs this toolkit's dependencies and its local Lefthook
commit-message validator. The root hook invokes `node bin/orbi-dev-tools.mjs`
directly, so the toolkit does not depend on an installed copy of itself.
Use a Conventional Commit such as `fix(7): validate release metadata`; the
optional scope can hold the related issue number. This checks message format,
while the author still chooses whether a change is a feature, fix, or breaking
change. Local hooks can be bypassed, so CI also validates PR titles. Prefer a
squash merge using the validated PR title as the commit subject so release-please
sees the intended change on `main`.

`npm run test:package` (also available as
`mise run package:smoke`) packs the current source, installs the tarball in a
temporary consumer, checks the installed executable and assets, generates the
GitHub baseline, and exercises label dry-run with installed dependencies.
It may download npm dependencies, performs no live GitHub operations, and
removes its temporary consumer afterwards. Use npm to run this smoke check;
the regular unit and mocked integration tests remain available via `pnpm test`.

## Maintaining releases

Toolkit CI validates current Node.js 22 and 24 on Ubuntu and Windows, including ESLint,
unit/mocked integration tests, Bash syntax, and the clean-package smoke check.
`npm publish` also runs checks and the package smoke check through
`prepublishOnly`. The package uses an explicit file allowlist for runtime assets.

Release-please proposes version and changelog changes in reviewable PRs. npm
publication is a separate manual workflow that verifies the selected release
tag and re-runs CI against its exact commit before publishing through OIDC.
Both release automation and workflow publication start disabled until the
documented account/repository configuration is complete.

See [the release guide](https://github.com/norbraet/orbi-dev-tools/blob/main/docs/RELEASING.md)
for the first manual release, trusted publisher setup, and subsequent releases.
These workflows release this toolkit; the files under `templates/github/` are
owned by consuming projects and have their own setup requirements.
