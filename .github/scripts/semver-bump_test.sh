#!/usr/bin/env bash
# Unit tests for semver-bump.sh (no network, no docker, no real git tags).
# Run: bash .github/scripts/semver-bump_test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="${ROOT}/.github/scripts/semver-bump.sh"
FAILS=0

pass() { echo "  ok — $1"; }
fail() { echo "  FAIL — $1" >&2; FAILS=$((FAILS + 1)); }

# Always inject EIP_SEMVER_TAGS (possibly empty) so production git/GHCR are never touched.
run_bump() {
  local mode="$1" bump="$2" out verfile ec=0
  out="$(mktemp)"
  verfile="$(mktemp)"
  (
    export GITHUB_OUTPUT="${out}"
    export EIP_SEMVER_TAGS="${EIP_SEMVER_TAGS-}"
    if [ -n "${EIP_SEMVER_GHCR_VERSION+x}" ]; then
      export EIP_SEMVER_GHCR_VERSION
    else
      unset EIP_SEMVER_GHCR_VERSION || true
    fi
    bash "${SCRIPT}" "${mode}" "${bump}" >"${verfile}" 2>/dev/null
  ) || ec=$?

  if [ "${ec}" -ne 0 ]; then
    rm -f "${out}" "${verfile}"
    return "${ec}"
  fi

  echo "__version=$(tr -d '\r' <"${verfile}" | tail -1)"
  while IFS= read -r line || [ -n "${line}" ]; do
    [ -z "${line}" ] && continue
    echo "__out_${line}"
  done <"${out}"
  rm -f "${out}" "${verfile}"
  return 0
}

expect_version() {
  local name="$1" mode="$2" bump="$3" want="$4" want_tag="$5"
  local dump got tag
  dump="$(run_bump "${mode}" "${bump}")" || {
    fail "${name}: unexpected exit"
    return 0
  }
  got="$(printf '%s\n' "${dump}" | sed -n 's/^__version=//p' | tail -1)"
  tag="$(printf '%s\n' "${dump}" | sed -n 's/^__out_tag=//p' | tail -1)"
  if [ "${got}" = "${want}" ] && [ "${tag}" = "${want_tag}" ]; then
    pass "${name} → ${want} (${want_tag})"
  else
    fail "${name}: want version=${want} tag=${want_tag}; got version=${got} tag=${tag}"
  fi
}

expect_fail() {
  local name="$1" mode="$2" bump="$3"
  local ec=0
  run_bump "${mode}" "${bump}" >/dev/null 2>&1 || ec=$?
  if [ "${ec}" -ne 0 ]; then
    pass "${name} (exit ${ec})"
  else
    fail "${name}: expected non-zero exit"
  fi
}

echo "semver-bump.sh tests"

# --- CLI ---
echo "CLI"
export EIP_SEMVER_TAGS=""
unset EIP_SEMVER_GHCR_VERSION || true
expect_version "empty history → 1.0.0" cli patch "1.0.0" "cli-v1.0.0"
expect_version "empty history ignores minor" cli minor "1.0.0" "cli-v1.0.0"
expect_version "empty history ignores major" cli major "1.0.0" "cli-v1.0.0"

export EIP_SEMVER_TAGS=$'cli-v1.0.0\ncli-v1.0.1\ncli'
expect_version "patch from highest pin" cli patch "1.0.2" "cli-v1.0.2"
expect_version "minor from highest pin" cli minor "1.1.0" "cli-v1.1.0"
expect_version "major from highest pin" cli major "2.0.0" "cli-v2.0.0"

export EIP_SEMVER_TAGS=$'cli-v1.0.9\ncli-v1.0.10\ncli-v0.9.99'
expect_version "numeric sort not lexical" cli patch "1.0.11" "cli-v1.0.11"

export EIP_SEMVER_TAGS=$'cli-v1.2.3\nnot-a-tag\ncli-v1.2.3-rc1\nv1.9.9'
expect_version "ignore junk / wrong prefix" cli patch "1.2.4" "cli-v1.2.4"

# --- App ---
echo "App"
export EIP_SEMVER_TAGS=""
export EIP_SEMVER_GHCR_VERSION="0.8.23"
expect_version "GHCR fallback patch" app patch "0.8.24" "app-v0.8.24"
expect_version "GHCR fallback minor" app minor "0.9.0" "app-v0.9.0"
expect_version "GHCR fallback major" app major "1.0.0" "app-v1.0.0"

export EIP_SEMVER_GHCR_VERSION="0.8.05"
expect_version "normalize padded GHCR label" app patch "0.8.6" "app-v0.8.6"

export EIP_SEMVER_TAGS=$'app-v0.8.20\napp-v0.8.22'
export EIP_SEMVER_GHCR_VERSION="0.8.99"
expect_version "app-v* wins over GHCR" app patch "0.8.23" "app-v0.8.23"

export EIP_SEMVER_TAGS=$'app-v0.8.05\napp-v0.8.4'
unset EIP_SEMVER_GHCR_VERSION || true
expect_version "normalize padded app-v tags" app patch "0.8.6" "app-v0.8.6"

export EIP_SEMVER_TAGS=""
export EIP_SEMVER_GHCR_VERSION="not-a-version"
expect_fail "app with invalid GHCR mock fails" app patch

# --- validation ---
echo "Validation"
export EIP_SEMVER_TAGS=""
unset EIP_SEMVER_GHCR_VERSION || true
expect_fail "bad mode" nope patch
expect_fail "bad bump" cli sideways

# --- GITHUB_OUTPUT keys ---
echo "GITHUB_OUTPUT"
out="$(mktemp)"
GITHUB_OUTPUT="${out}" EIP_SEMVER_TAGS="cli-v2.0.0" \
  bash "${SCRIPT}" cli patch >/dev/null 2>&1
for key in version tag major minor patch base; do
  if grep -q "^${key}=" "${out}"; then
    pass "output has ${key}"
  else
    fail "output missing ${key}"
  fi
done
grep -qx 'version=2.0.1' "${out}" && pass "output version=2.0.1" || fail "output version wrong: $(tr '\n' ' ' <"${out}")"
grep -qx 'tag=cli-v2.0.1' "${out}" && pass "output tag=cli-v2.0.1" || fail "output tag wrong"
grep -qx 'base=2.0.0' "${out}" && pass "output base=2.0.0" || fail "output base wrong"
rm -f "${out}"

# --- notes body strip (same sed as Public publish workflows) ---
echo "Release notes body strip"
notes="$(mktemp)"
printf '%s\n' '# Title' '' '- bullet one' '- bullet two' >"${notes}"
BODY="$(sed '1{/^#/d;}' "${notes}" | sed '/./,$!d')"
if echo "${BODY}" | grep -q 'bullet one' && echo "${BODY}" | grep -q 'bullet two'; then
  pass "strip leading H1 keeps bullets"
else
  fail "notes strip unexpected: ${BODY}"
fi
printf '%s\n' '# Title only' '' >"${notes}"
BODY="$(sed '1{/^#/d;}' "${notes}" | sed '/./,$!d')"
if [ -z "$(echo "${BODY}" | tr -d '[:space:]')" ]; then
  pass "title-only notes count as empty"
else
  fail "title-only should be empty after strip"
fi
rm -f "${notes}"

echo
if [ "${FAILS}" -eq 0 ]; then
  echo "All semver-bump tests passed."
  exit 0
fi
echo "${FAILS} test(s) failed." >&2
exit 1
