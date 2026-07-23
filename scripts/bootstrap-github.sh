#!/usr/bin/env bash

set -euo pipefail

labels_file="${ORBI_DEV_TOOLS_LABELS_FILE:-.github/labels.yml}"
milestones_file="${ORBI_DEV_TOOLS_MILESTONES_FILE:-.github/milestones.yml}"
project_file="${ORBI_DEV_TOOLS_PROJECT_FILE:-.github/project.yml}"
is_dry_run=false

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-github.sh [--dry-run]

Synchronize the repository labels, milestones, GitHub Project, Discussions
setting, default workflow permissions, the develop branch and its promotion
to default branch, and the main/develop ruleset from the canonical
configuration under .github/. Existing items are updated and missing items
are created. Project views and built-in workflows remain a manual step.
EOF
}

while (($# > 0)); do
  case "$1" in
    --dry-run)
      is_dry_run=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

for command in gh git sed; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

for file in "$labels_file" "$milestones_file" "$project_file"; do
  if [[ ! -f "$file" ]]; then
    printf 'Required configuration file not found: %s\n' "$file" >&2
    exit 1
  fi
done

run() {
  if [[ "$is_dry_run" == true ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
    return
  fi

  "$@"
}

if [[ "$is_dry_run" == false ]]; then
  gh auth status >/dev/null
fi

repository="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
owner="${repository%%/*}"

# Two-branch convention for this template: feature branches merge into
# develop (the default branch); a deliberate develop -> main pull request
# (see `mise run release:promote`) is the only path that updates main, which
# is what triggers release-please. GitHub has no rule type that restricts
# which branch a pull request may come from, so this ordering is a
# documented convention (see CONTRIBUTING.md), not a technical guarantee.
release_branch="${ORBI_DEV_TOOLS_RELEASE_BRANCH:-main}"
integration_branch="${ORBI_DEV_TOOLS_INTEGRATION_BRANCH:-develop}"

printf 'Synchronizing GitHub configuration for %s.\n' "$repository"

run gh api --method PATCH "repos/$repository" -F has_discussions=true

# Keep repository Actions defaults permissive for repository automation. The
# release-please workflow itself uses the RELEASE_PLEASE_TOKEN fine-grained
# PAT, whose repository permissions are configured separately as a secret.
run gh api --method PUT "repos/$repository/actions/permissions/workflow" \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true

if gh api "repos/$repository/branches/$integration_branch" >/dev/null 2>&1; then
  printf 'Branch already exists: %s\n' "$integration_branch"
else
  release_branch_sha="$(
    gh api "repos/$repository/git/ref/heads/$release_branch" --jq .object.sha
  )"
  run gh api --method POST "repos/$repository/git/refs" \
    -f ref="refs/heads/$integration_branch" \
    -f sha="$release_branch_sha"
fi

current_default_branch="$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)"
if [[ "$current_default_branch" == "$integration_branch" ]]; then
  printf 'Default branch already set to: %s\n' "$integration_branch"
else
  run gh api --method PATCH "repos/$repository" -f default_branch="$integration_branch"
fi

ruleset_name='Protect main and develop'
existing_ruleset_id="$(
  gh api --paginate "repos/$repository/rulesets" \
    --jq ".[] | select(.name == \"$ruleset_name\") | .id" |
    head -n 1
)"

# Single-developer baseline: require the CI and PR-title checks to pass and
# require a pull request, but allow zero approving reviews so the owner can
# still self-merge. Block force-pushes and deletion of both branches.
ruleset_payload="$(
  cat <<JSON
{
  "name": "$ruleset_name",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/$release_branch", "refs/heads/$integration_branch"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Format, analyze, and test" },
          { "context": "conventional-title" }
        ]
      }
    }
  ]
}
JSON
)"

if [[ "$is_dry_run" == true ]]; then
  printf '[dry-run] sync ruleset %q for %q (existing id: %s)\n' \
    "$ruleset_name" "$repository" "${existing_ruleset_id:-none}"
elif [[ -n "$existing_ruleset_id" ]]; then
  gh api --method PUT "repos/$repository/rulesets/$existing_ruleset_id" --input - <<<"$ruleset_payload" >/dev/null
  printf 'Repository ruleset updated: %s\n' "$ruleset_name"
else
  gh api --method POST "repos/$repository/rulesets" --input - <<<"$ruleset_payload" >/dev/null
  printf 'Repository ruleset created: %s\n' "$ruleset_name"
fi

while IFS='|' read -r name color description; do
  [[ -z "$name" ]] && continue
  run gh label create "$name" \
    --repo "$repository" \
    --color "$color" \
    --description "$description" \
    --force
done < <(
  sed -n 's/^  - { name: "\([^"]*\)", color: "\([^"]*\)", description: "\([^"]*\)" }$/\1|\2|\3/p' "$labels_file"
)

milestone_title=''
previous_milestone_title=''
while IFS= read -r line; do
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]title:[[:space:]]\"(.*)\"$ ]]; then
    milestone_title="${BASH_REMATCH[1]}"
    continue
  fi

  if [[ "$line" =~ ^[[:space:]]*previous_title:[[:space:]]\"(.*)\"$ ]]; then
    previous_milestone_title="${BASH_REMATCH[1]}"
    continue
  fi

  if [[ "$line" =~ ^[[:space:]]*description:[[:space:]]\"(.*)\"$ ]] && [[ -n "$milestone_title" ]]; then
    description="${BASH_REMATCH[1]}"
    existing_number="$(
      gh api --paginate "repos/$repository/milestones?state=all&per_page=100" \
        --jq ".[] | select(.title == \"$milestone_title\") | .number" |
        head -n 1
    )"

    if [[ -z "$existing_number" ]] && [[ -n "$previous_milestone_title" ]]; then
      existing_number="$(
        gh api --paginate "repos/$repository/milestones?state=all&per_page=100" \
          --jq ".[] | select(.title == \"$previous_milestone_title\") | .number" |
          head -n 1
      )"
    fi

    if [[ -n "$existing_number" ]]; then
      run gh api --method PATCH "repos/$repository/milestones/$existing_number" \
        -f title="$milestone_title" \
        -f description="$description"
    else
      run gh api --method POST "repos/$repository/milestones" \
        -f title="$milestone_title" \
        -f description="$description"
    fi
    milestone_title=''
    previous_milestone_title=''
  fi
done < "$milestones_file"

project_title="$(sed -n 's/^title: //p' "$project_file" | head -n 1)"
project_description="$(sed -n 's/^description: //p' "$project_file" | head -n 1)"
project_readme="$(
  sed -n '/^readme: |$/,/^fields:$/p' "$project_file" |
    sed '1d;$d;s/^  //'
)"

project_number="$(
  gh project list --owner "$owner" --limit 100 --format json \
    --jq ".projects[] | select(.title == \"$project_title\") | .number" |
    head -n 1
)"

if [[ -z "$project_number" ]]; then
  if [[ "$is_dry_run" == true ]]; then
    printf '[dry-run] create project %q for %q\n' "$project_title" "$owner"
    printf '[dry-run] project fields and repository link require the created project number\n'
    exit 0
  fi

  project_number="$(
    gh project create --owner "$owner" --title "$project_title" \
      --format json --jq .number
  )"
fi

project_id="$(
  gh project view "$project_number" --owner "$owner" --format json --jq .id
)"

project_update_query='mutation($projectId:ID!,$title:String!,$shortDescription:String!,$readme:String!){updateProjectV2(input:{projectId:$projectId,title:$title,shortDescription:$shortDescription,readme:$readme}){projectV2{id}}}'
run gh api graphql \
  -f query="$project_update_query" \
  -f projectId="$project_id" \
  -f title="$project_title" \
  -f shortDescription="$project_description" \
  -f readme="$project_readme"

run gh project link "$project_number" --owner "$owner" --repo "$repository"

while IFS='|' read -r field_key options; do
  [[ -z "$field_key" ]] && continue
  case "$field_key" in
    delivery_status) field_name='Delivery status' ;;
    priority) field_name='Priority' ;;
    effort) field_name='Effort' ;;
    area) field_name='Area' ;;
    *)
      printf 'Unknown project field key: %s\n' "$field_key" >&2
      exit 1
      ;;
  esac
  existing_field="$(
    gh project field-list "$project_number" --owner "$owner" --limit 100 \
      --format json --jq ".fields[] | select(.name == \"$field_name\") | .name" |
      head -n 1
  )"

  if [[ -z "$existing_field" ]]; then
    run gh project field-create "$project_number" \
      --owner "$owner" \
      --name "$field_name" \
      --data-type SINGLE_SELECT \
      --single-select-options "$options"
  else
    printf 'Project field already exists: %s\n' "$field_name"
  fi
done < <(
  sed -n '/^fields:$/,/^workflows:$/p' "$project_file" |
    sed -n 's/^  \([^:]*\): \[\(.*\)\]$/\1|\2/p' |
    sed 's/, /,/g'
)

printf 'GitHub labels, milestones, project metadata, link, fields, Discussions,\n'
printf 'default workflow permissions, the develop branch, and the main/develop\n'
printf 'ruleset are synchronized. Configure project views and built-in workflows\n'
printf 'in the GitHub UI as documented.\n'
