#!/usr/bin/env bash
# Resolve next Public semver for app or CLI at workflow run time.
#
# Usage: semver-bump.sh <app|cli> <patch|minor|major>
#
# App base (never hardcode; never seed 0.0.0):
#   1) highest git tag app-vX.Y.Z
#   2) else org.opencontainers.image.version on GHCR …-api:latest
#   then apply bump
#
# CLI base:
#   1) highest git tag cli-vX.Y.Z → apply bump
#   2) else first ship 1.0.0 (empty history only; bump ignored)
#
# Writes version/tag/major/minor/patch/base to GITHUB_OUTPUT when set.
#
# Test hooks (used by semver-bump_test.sh; unset in production CI):
#   EIP_SEMVER_TAGS          newline-separated tag names (skip git fetch/ls-remote)
#   EIP_SEMVER_GHCR_VERSION  pretend GHCR :latest label (skip docker pull)
set -euo pipefail

MODE="${1:-}"
BUMP="${2:-}"

if [ "${MODE}" != "app" ] && [ "${MODE}" != "cli" ]; then
  echo "Usage: $0 <app|cli> <patch|minor|major>" >&2
  exit 2
fi
case "${BUMP}" in
  patch|minor|major) ;;
  *)
    echo "::error::bump must be patch|minor|major (got: ${BUMP})" >&2
    exit 2
    ;;
esac

normalize_semver() {
  local raw="$1"
  raw="$(echo "${raw}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if ! echo "${raw}" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    return 1
  fi
  # Strip leading zeros per component (0.8.05 → 0.8.5).
  awk -F. -v v="${raw}" 'BEGIN {
    n = split(v, a, ".");
    if (n != 3) exit 1;
    printf "%d.%d.%d\n", a[1]+0, a[2]+0, a[3]+0;
  }'
}

highest_semver() {
  local best="" cur
  while IFS= read -r cur; do
    [ -z "${cur}" ] && continue
    cur="$(normalize_semver "${cur}" || true)"
    [ -z "${cur}" ] && continue
    if [ -z "${best}" ]; then
      best="${cur}"
      continue
    fi
    # Compare as major/minor/patch integers.
    if printf '%s\n%s\n' "${best}" "${cur}" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1 | grep -qx "${cur}"; then
      best="${cur}"
    fi
  done
  printf '%s' "${best}"
}

bump_semver() {
  local base="$1" kind="$2"
  local maj min pat
  IFS=. read -r maj min pat <<< "${base}"
  case "${kind}" in
    patch) pat=$((pat + 1)) ;;
    minor) min=$((min + 1)); pat=0 ;;
    major) maj=$((maj + 1)); min=0; pat=0 ;;
  esac
  printf '%d.%d.%d' "${maj}" "${min}" "${pat}"
}

list_prefix_tags() {
  local prefix="$1" # app-v or cli-v
  if [ -n "${EIP_SEMVER_TAGS+x}" ]; then
    # Explicit fixture (may be empty) — do not touch git remotes.
    printf '%s\n' "${EIP_SEMVER_TAGS}"
    return 0
  fi
  git fetch --tags --force origin 2>/dev/null || true
  {
    git tag -l "${prefix}*" 2>/dev/null || true
    git ls-remote --tags origin "refs/tags/${prefix}*" 2>/dev/null \
      | awk '{print $2}' | sed 's#^refs/tags/##' | sed 's#\^{}$##' || true
  }
}

max_git_tag_semver() {
  local prefix="$1" # app-v or cli-v
  list_prefix_tags "${prefix}" | sed "s/^${prefix}//" | highest_semver
}

ghcr_latest_app_version() {
  local owner repo image ver
  if [ -n "${EIP_SEMVER_GHCR_VERSION:-}" ]; then
    ver="$(normalize_semver "${EIP_SEMVER_GHCR_VERSION}" || true)"
    if [ -z "${ver}" ]; then
      echo "::error::EIP_SEMVER_GHCR_VERSION is not a usable X.Y.Z (${EIP_SEMVER_GHCR_VERSION})" >&2
      return 1
    fi
    printf '%s' "${ver}"
    return 0
  fi

  owner="$(echo "${GITHUB_REPOSITORY_OWNER:-${GITHUB_REPOSITORY%%/*}}" | tr '[:upper:]' '[:lower:]')"
  repo="$(echo "${GITHUB_REPOSITORY##*/}" | tr '[:upper:]' '[:lower:]')"
  image="${EIP_GHCR_API_IMAGE:-ghcr.io/${owner}/${repo}-api:latest}"

  echo "Reading app base from ${image}" >&2
  if ! docker pull "${image}" >/dev/null; then
    echo "::error::could not pull ${image} to read org.opencontainers.image.version" >&2
    return 1
  fi
  ver="$(docker image inspect "${image}" --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null || true)"
  ver="$(normalize_semver "${ver}" || true)"
  if [ -z "${ver}" ]; then
    echo "::error::${image} missing usable org.opencontainers.image.version label" >&2
    return 1
  fi
  printf '%s' "${ver}"
}

BASE=""
NEXT=""
TAG_PREFIX=""

case "${MODE}" in
  app)
    TAG_PREFIX="app-v"
    BASE="$(max_git_tag_semver "app-v")"
    if [ -n "${BASE}" ]; then
      echo "App base from git tag app-v${BASE}" >&2
    else
      BASE="$(ghcr_latest_app_version)"
      echo "App base from GHCR :latest → ${BASE}" >&2
    fi
    if [ -z "${BASE}" ]; then
      echo "::error::could not resolve app base (no app-v* tags and no GHCR :latest version)" >&2
      exit 1
    fi
    NEXT="$(bump_semver "${BASE}" "${BUMP}")"
    ;;
  cli)
    TAG_PREFIX="cli-v"
    BASE="$(max_git_tag_semver "cli-v")"
    if [ -z "${BASE}" ]; then
      NEXT="1.0.0"
      BASE="(none)"
      echo "CLI empty history → first ship ${NEXT}" >&2
    else
      echo "CLI base from git tag cli-v${BASE}" >&2
      NEXT="$(bump_semver "${BASE}" "${BUMP}")"
    fi
    ;;
esac

MAJOR="$(echo "${NEXT}" | cut -d. -f1)"
MINOR="$(echo "${NEXT}" | cut -d. -f2)"
PATCH="$(echo "${NEXT}" | cut -d. -f3)"
TAG="${TAG_PREFIX}${NEXT}"

echo "Resolved ${MODE}: base=${BASE} bump=${BUMP} → ${NEXT} (${TAG})" >&2

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "version=${NEXT}"
    echo "tag=${TAG}"
    echo "major=${MAJOR}"
    echo "minor=${MINOR}"
    echo "patch=${PATCH}"
    echo "base=${BASE}"
  } >> "${GITHUB_OUTPUT}"
fi

printf '%s\n' "${NEXT}"
