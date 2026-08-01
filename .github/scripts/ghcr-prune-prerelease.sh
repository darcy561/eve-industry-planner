#!/usr/bin/env bash
# Delete GHCR package versions whose tags are prerelease-only.
# Never deletes versions that carry live Public tags (:latest / semver).
#
# Usage:
#   ghcr-prune-prerelease.sh
#
# Required env:
#   GHCR_TOKEN   PAT with read:packages + delete:packages (same owner as packages)
#   OWNER        GitHub user/org that owns the packages
#   REPO_NAME    lowercase repo name (package prefix: ${REPO_NAME}-${service})
#
# Optional env:
#   SERVICES            space-separated services (default: api websocket worker core frontend ws-router)
#   DRY_RUN             true|false (default: true)
#   KEEP_FLOATING       true|false (default: true) — keep versions tagged as
#                       prerelease / prerelease-<slug> (still deletes orphaned
#                       0.0.0-prerelease.* pins that no longer carry floating tags)
#   GITHUB_API_VERSION  default 2022-11-28
#
# Classification (any match wins for "live"; prerelease only if not live):
#   live:        latest | ^[0-9]+(\.[0-9]+){0,2}$
#   prerelease:  prerelease | prerelease-* | 0.0.0-prerelease.*
set -euo pipefail

OWNER="${OWNER:-}"
REPO_NAME="${REPO_NAME:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
SERVICES="${SERVICES:-api websocket worker core frontend ws-router}"
DRY_RUN="${DRY_RUN:-true}"
KEEP_FLOATING="${KEEP_FLOATING:-true}"
API_VER="${GITHUB_API_VERSION:-2022-11-28}"

if [ -z "${OWNER}" ] || [ -z "${REPO_NAME}" ] || [ -z "${GHCR_TOKEN}" ]; then
  echo "Usage: OWNER=… REPO_NAME=… GHCR_TOKEN=… $0" >&2
  exit 2
fi

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

# stdin: newline-separated tags → exit 0 if version should be deleted
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
    # Untagged digests — leave alone (could be live after retag edge cases).
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
    # Floating-only pointer — keep channel tags usable.
    return 1
  fi
  if [ "${KEEP_FLOATING}" = "true" ] && [ "${has_immutable}" = "true" ] && [ "${has_floating}" = "true" ]; then
    # Current tip still carries floating + pin — keep so :prerelease keeps resolving.
    return 1
  fi

  return 0
}

api_get() {
  local url="$1"
  local out="$2"
  local code
  code="$(curl -sS -o "${out}" -w "%{http_code}" \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${GHCR_TOKEN}" \
    -H "X-GitHub-Api-Version: ${API_VER}" \
    "${url}" || true)"
  echo "${code}"
}

api_delete() {
  local url="$1"
  local out="$2"
  local code
  code="$(curl -sS -o "${out}" -w "%{http_code}" -X DELETE \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${GHCR_TOKEN}" \
    -H "X-GitHub-Api-Version: ${API_VER}" \
    "${url}" || true)"
  echo "${code}"
}

TOTAL_SCANNED=0
TOTAL_DELETE=0
TOTAL_SKIP_LIVE=0
TOTAL_SKIP_OTHER=0
TOTAL_DELETED=0
TOTAL_ERRORS=0

SUMMARY="${GITHUB_STEP_SUMMARY:-}"
if [ -n "${SUMMARY}" ]; then
  {
    echo "### Prune prerelease GHCR versions"
    echo "- Owner: \`${OWNER}\`"
    echo "- Repo prefix: \`${REPO_NAME}-\`*"
    echo "- Dry run: \`${DRY_RUN}\`"
    echo "- Keep floating: \`${KEEP_FLOATING}\`"
    echo "- Services: \`${SERVICES}\`"
    echo ""
  } >> "${SUMMARY}"
fi

for svc in ${SERVICES}; do
  PKG="${REPO_NAME}-${svc}"
  echo "::group::Package ${PKG}"
  PAGE=1
  PKG_SCANNED=0
  CANDIDATES_FILE="$(mktemp)"
  KEEP_LOG="$(mktemp)"

  while true; do
    URL="https://api.github.com/users/${OWNER}/packages/container/${PKG}/versions?per_page=100&page=${PAGE}"
    CODE="$(api_get "${URL}" /tmp/ghcr-versions.json)"
    if [ "${CODE}" = "404" ]; then
      echo "Package ${PKG} not found — skip"
      break
    fi
    if [ "${CODE}" != "200" ]; then
      echo "::error::List versions ${PKG} failed HTTP ${CODE}"
      cat /tmp/ghcr-versions.json || true
      TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
      break
    fi

    COUNT="$(jq 'length' /tmp/ghcr-versions.json)"
    if [ "${COUNT}" = "0" ]; then
      break
    fi

    while IFS= read -r row; do
      VID="$(echo "${row}" | jq -r '.id')"
      TAGS="$(echo "${row}" | jq -r '.metadata.container.tags // [] | .[]')"
      TAG_CSV="$(echo "${TAGS}" | paste -sd, - || true)"
      PKG_SCANNED=$((PKG_SCANNED + 1))
      TOTAL_SCANNED=$((TOTAL_SCANNED + 1))

      if echo "${TAGS}" | should_delete_version; then
        TOTAL_DELETE=$((TOTAL_DELETE + 1))
        printf '%s\t%s\n' "${VID}" "${TAG_CSV}" >> "${CANDIDATES_FILE}"
      else
        LIVE_HIT=false
        while IFS= read -r t; do
          [ -z "${t}" ] && continue
          if is_live_tag "${t}"; then
            LIVE_HIT=true
            break
          fi
        done <<< "${TAGS}"
        if [ "${LIVE_HIT}" = "true" ]; then
          TOTAL_SKIP_LIVE=$((TOTAL_SKIP_LIVE + 1))
          echo "Keep (live) ${PKG} version=${VID} tags=[${TAG_CSV}]" >> "${KEEP_LOG}"
        else
          TOTAL_SKIP_OTHER=$((TOTAL_SKIP_OTHER + 1))
          echo "Keep ${PKG} version=${VID} tags=[${TAG_CSV}]" >> "${KEEP_LOG}"
        fi
      fi
    done < <(jq -c '.[]' /tmp/ghcr-versions.json)

    if [ "${COUNT}" -lt 100 ]; then
      break
    fi
    PAGE=$((PAGE + 1))
  done

  if [ -s "${KEEP_LOG}" ]; then
    cat "${KEEP_LOG}"
  fi

  PKG_CANDIDATES=0
  if [ -s "${CANDIDATES_FILE}" ]; then
    PKG_CANDIDATES="$(wc -l < "${CANDIDATES_FILE}" | tr -d ' ')"
  fi

  while IFS=$'\t' read -r VID TAG_CSV; do
    [ -z "${VID}" ] && continue
    if [ "${DRY_RUN}" = "true" ]; then
      echo "DRY-RUN would delete ${PKG} version=${VID} tags=[${TAG_CSV}]"
    else
      DEL_URL="https://api.github.com/users/${OWNER}/packages/container/${PKG}/versions/${VID}"
      DCODE="$(api_delete "${DEL_URL}" /tmp/ghcr-delete.json)"
      if [ "${DCODE}" = "204" ] || [ "${DCODE}" = "200" ]; then
        echo "Deleted ${PKG} version=${VID} tags=[${TAG_CSV}]"
        TOTAL_DELETED=$((TOTAL_DELETED + 1))
      else
        echo "::error::Delete ${PKG} version=${VID} failed HTTP ${DCODE}"
        cat /tmp/ghcr-delete.json || true
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
      fi
    fi
  done < "${CANDIDATES_FILE}"

  rm -f "${CANDIDATES_FILE}" "${KEEP_LOG}"
  echo "Scanned ${PKG_SCANNED}; candidates ${PKG_CANDIDATES}"
  echo "::endgroup::"
done

if [ -n "${SUMMARY}" ]; then
  {
    echo "| Metric | Count |"
    echo "|--------|------:|"
    echo "| Versions scanned | ${TOTAL_SCANNED} |"
    echo "| Prerelease candidates | ${TOTAL_DELETE} |"
    echo "| Deleted | ${TOTAL_DELETED} |"
    echo "| Kept (live tags) | ${TOTAL_SKIP_LIVE} |"
    echo "| Kept (other) | ${TOTAL_SKIP_OTHER} |"
    echo "| Errors | ${TOTAL_ERRORS} |"
  } >> "${SUMMARY}"
fi

echo "Done. scanned=${TOTAL_SCANNED} candidates=${TOTAL_DELETE} deleted=${TOTAL_DELETED} errors=${TOTAL_ERRORS}"

if [ "${TOTAL_ERRORS}" -gt 0 ]; then
  exit 1
fi
