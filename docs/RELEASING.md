# Releasing Orbi Dev Tools

The target is the public npm registry at `https://registry.npmjs.org/`, under
`@norbraet/orbi-dev-tools`. Public consumers need no registry credentials.
Only package maintainers and the configured publishing workflow can publish.
This guide releases the toolkit itself; consumer release automation is separate.

## What runs automatically

- **Toolkit CI** (`ci.yml`) validates PRs and pushes to `main`, with Node 22 and
  24 on Ubuntu and Windows. It installs with the frozen pnpm lockfile, checks all
  JavaScript sources and Bash syntax, runs tests, and installs the packed package
  in a temporary consumer. PR titles are checked as Conventional Commits.
- **Release proposal** (`release-please.yml`) manages a version/changelog PR and
  creates its tag/GitHub release after merge. It is disabled until the repository
  variable `RELEASE_AUTOMATION_ENABLED` is exactly `true`.
- **Publish npm package** (`publish.yml`) is manual. It is disabled until
  `NPM_PUBLISH_ENABLED` is exactly `true`. A dispatch must use the `main` workflow
  and select an existing stable tag such as `v0.1.1`.

Publishing verifies that the tag is reachable from `origin/main`, its package
version matches the tag and release manifest, public package metadata matches
this repository, and the changelog contains that version. It resolves the tag
once, then validates and publishes that exact commit. A failed or skipped
validation job prevents the publishing job from running. The workflow does not
publish on ordinary merges or merely because a tag/release was created.

`prepublishOnly` also runs checks and package verification for a normal local
`npm publish`. Do not bypass it with `--ignore-scripts` when publishing.

## First release: manual account bootstrap

The maintainer has created npm user `norbraet` and enabled 2FA. Check the active
account and package ownership with npm before the first release; GitHub identity
does not authenticate npm. A public registry lookup returning 404 means no
public package was found, not an unconditional guarantee of name availability.

1. Merge the publishing changes, wait for Toolkit CI on `main` to pass, and use
   a clean, updated local checkout of that commit. Keep both automation variables
   disabled during this bootstrap.
2. Use Node 24 and npm 11.5.2 (the version pinned by the publishing workflow),
   then install dependencies with `pnpm install --frozen-lockfile`.
3. Run `npm publish --dry-run` to exercise the publishing checks and inspect the
   package without uploading it. The allowlist includes the CLI, source modules,
   runtime Bash/Node helpers, templates, README, license, and changelog. It excludes
   tests, workflows, release configuration, and maintainer documentation.
4. Authenticate interactively and confirm that npm reports `norbraet`:

   ```sh
   npm login --registry=https://registry.npmjs.org/
   npm whoami --registry=https://registry.npmjs.org/
   npm view @norbraet/orbi-dev-tools version --registry=https://registry.npmjs.org/
   ```

   If the package exists, inspect its ownership and versions before continuing.
   If `0.1.0` already exists, do not try to overwrite it or move its tag.
5. Verify that `package.json`, `.release-please-manifest.json`, and the changelog
   all describe `0.1.0`. When intentionally ready to release publicly, run:

   ```sh
   npm publish --access public
   ```

   This runs the checks/smoke check, then asks for npm's required authentication.
   The first local publish does not request CI provenance. Credentials belong in
   your user account/npm configuration, never in this repository.
6. After npm confirms success, verify the registry result and tag that same
   tested commit, then create the matching GitHub release:

   ```sh
   npm view @norbraet/orbi-dev-tools@0.1.0 version --registry=https://registry.npmjs.org/
   git tag v0.1.0
   git push origin v0.1.0
   gh release create v0.1.0 --verify-tag --title v0.1.0 --notes-file CHANGELOG.md
   ```

No command in this section has been run as part of implementing the workflows.

## Configure trusted publishing after bootstrap

The GitHub workflow publishes using npm OIDC rather than an `NPM_TOKEN` secret.
The publishing job uses a GitHub-hosted Ubuntu runner, Node 24, npm 11.5.2,
`id-token: write`, and the `npm` GitHub environment. npm trusted publishing
requires npm >=11.5.1 and Node >=22.14.0. See
[npm's trusted publishing guide](https://docs.npmjs.com/trusted-publishers/).

1. Create the GitHub environment **npm** in this repository's settings. Restrict
   deployment branches to `main`; add a reviewer if you want an additional
   approval before publishing.
2. In the npm package's Settings → Trusted publishing, add GitHub Actions with:

   | Field | Value |
   |---|---|
   | Organization or user | `norbraet` |
   | Repository | `orbi-dev-tools` |
   | Workflow filename | `publish.yml` |
   | Environment | `npm` |
   | Allowed actions | Enable direct `npm publish` |

   Enter the filename only, not `.github/workflows/publish.yml`. New publisher
   configurations may otherwise allow staging only. Create this connection close
   to the next intended release: npm currently requires a successful first publish
   within two days or the configuration expires and must be recreated.
3. Set repository Actions variable **NPM_PUBLISH_ENABLED** to `true` only when the
   connection is ready. Do not dispatch the already-published `v0.1.0` tag.

Public repository/package publishing through OIDC produces npm provenance. No
npm write token needs to be stored in GitHub. Account settings and the OIDC
connection cannot be verified by unit tests; the first intended workflow release
is the end-to-end authentication check.

## Enable version and changelog proposals

After the first npm/GitHub release exists, set repository Actions variable
**RELEASE_AUTOMATION_ENABLED** to `true`. Allow GitHub Actions to create pull
requests in repository settings. The default workflow uses `GITHUB_TOKEN`.

Eligible PR events created using that default token can create CI runs waiting
for approval. Approve those runs from the release PR, or run **Toolkit CI**
manually on its branch, and review the results before merging. If you want PR
CI to run without that approval step, configure a separate
`RELEASE_PLEASE_TOKEN` GitHub secret with contents, issues, and pull-request write
access to this repository; the workflow uses it when present. This GitHub token
is separate from npm authentication and is optional.

The toolkit's local Lefthook hook validates commit-message format after
`mise run setup`. CI validates PR titles as well. Prefer squash merging with the
validated PR title as the resulting commit subject: release-please reads the
history on `main`, so a good local message alone is insufficient if the final
merge message loses its Conventional Commit type. Format checks cannot decide
whether a change should semantically be a feature, fix, or breaking change;
review that intent before merging.

The Node release strategy updates `package.json`, the root release manifest, and
`CHANGELOG.md`, based on Conventional Commits. `fix` changes normally increment
patch, `feat` increments minor, and breaking changes increment major. With the
configured pre-1.0 behavior, breaking changes increment minor while the version
is below 1.0.0. Review version selection in each release PR rather than updating
only one version file manually. See
[release-please](https://github.com/googleapis/release-please-action) and its
[manifest configuration](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md).

## Subsequent releases

1. Merge feature/fix PRs with Conventional Commit titles into `main`.
2. Review release-please's version/changelog PR and its checks, then merge it.
   Release-please creates a GitHub release and stable `vX.Y.Z` tag.
3. Open Actions → **Publish npm package** → Run workflow, select **main**, and
   enter that exact tag. The workflow verifies the tag, runs the CI matrix on its
   resolved commit, and publishes only after validation succeeds.
4. Verify the version on npm, then update consuming projects deliberately:

   ```sh
   pnpm add --save-dev --save-exact @norbraet/orbi-dev-tools@X.Y.Z
   ```

Prerelease tags are intentionally rejected by this first publishing workflow.
Existing npm versions are immutable: fix an erroneous release with a new version
rather than changing a published version or moving its tag. If CI fails, fix the
source and create a corrected release before publishing. If authentication alone
fails, correct the external settings and retry the same unchanged tag, after
checking that npm did not already receive that version.
