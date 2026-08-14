#!/usr/bin/env bash
# Unit tests for ghcr-prune-prerelease.sh tag classification (no network).
set -euo pipefail

# Mirrors helpers in ghcr-prune-prerelease.sh (keep in sync).
is_live_tag() {
  local t="$1"
  [ "${t}" = "latest" ] && return 0
  echo "${t}" | grep -qE '^[0-9]+(\.[0-9]+){0,2}$'
}

is_prerelease_tag() {
  local t="$1"
  [ "${t}" = "prerelease" ] && return 0
  case "${t}" in
    prerelease-*) return 0 ;;
  esac
  echo "${t}" | grep -qE '^0\.0\.0-prerelease\.'
}

is_floating_prerelease_tag() {
  local t="$1"
  [ "${t}" = "prerelease" ] && return 0
  case "${t}" in
    prerelease-*) return 0 ;;
  esac
  return 1
}

should_delete_version() {
  local tags_raw
  tags_raw="$(cat)"
  local -a tags=()
  local t
  while IFS= read -r t; do
    [ -z "${t}" ] && continue
    tags+=("${t}")
  done <<< "${tags_raw}"

  if [ "${#tags[@]}" -eq 0 ]; then
    return 1
  fi

  local has_live=false has_prerelease=false has_immutable=false has_floating=false
  for t in "${tags[@]}"; do
    if is_live_tag "${t}"; then
      has_live=true
    fi
    if is_prerelease_tag "${t}"; then
      has_prerelease=true
      if is_floating_prerelease_tag "${t}"; then
        has_floating=true
      else
        has_immutable=true
      fi
    fi
  done

  if [ "${has_live}" = "true" ]; then
    return 1
  fi
  if [ "${has_prerelease}" != "true" ]; then
    return 1
  fi

  if [ "${KEEP_FLOATING}" = "true" ] && [ "${has_immutable}" != "true" ] && [ "${has_floating}" = "true" ]; then
    return 1
  fi
  if [ "${KEEP_FLOATING}" = "true" ] && [ "${has_immutable}" = "true" ] && [ "${has_floating}" = "true" ]; then
    return 1
  fi

  return 0
}

fail=0
assert_delete() {
  local name="$1"
  local tags="$2"
  if printf '%s\n' ${tags} | should_delete_version; then
    echo "OK delete: ${name}"
  else
    echo "FAIL expected delete: ${name} tags=${tags}"
    fail=1
  fi
}

assert_keep() {
  local name="$1"
  local tags="$2"
  if printf '%s\n' ${tags} | should_delete_version; then
    echo "FAIL expected keep: ${name} tags=${tags}"
    fail=1
  else
    echo "OK keep: ${name}"
  fi
}

KEEP_FLOATING=true
assert_keep "live latest" "latest"
assert_keep "live semver" "1.2.3"
assert_keep "live major.minor" "1.2"
assert_keep "live major" "1"
assert_keep "live multi" "1.2.3 latest 1.2"
assert_keep "floating tip with pin" "0.0.0-prerelease.development.abc1234 prerelease prerelease-development"
assert_keep "floating only" "prerelease"
assert_keep "branch float only" "prerelease-swarm-foo"
assert_delete "old pin only" "0.0.0-prerelease.development.deadbee"
assert_keep "unrelated tag" "some-other-tag"
assert_keep "empty" ""

KEEP_FLOATING=false
assert_delete "pin when not keeping float" "0.0.0-prerelease.development.abc1234"
assert_delete "floating when not keeping" "prerelease"
assert_delete "tip when not keeping" "0.0.0-prerelease.development.abc1234 prerelease"
assert_keep "live still sacred" "1.4.0 latest"

if [ "${fail}" -ne 0 ]; then
  echo "FAILED" >&2
  exit 1
fi
echo "All ghcr-prune-prerelease classification tests passed."
