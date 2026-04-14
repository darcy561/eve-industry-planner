#!/usr/bin/env bash
set -euo pipefail

# Reads VERSION.json without jq (bash + sed only). Assumes typical formatting:
# string values for frontend/backend; feature_flags is a JSON object (brace matching;
# no unquoted { or } inside string values in that object).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="${ROOT_DIR}/VERSION.json"
DEV_COMPOSE_FILE="${ROOT_DIR}/docker-compose.dev.yml"

if [[ ! -f "${VERSION_FILE}" ]]; then
  echo "Error: VERSION.json not found at ${VERSION_FILE}" >&2
  exit 1
fi

if [[ ! -f "${DEV_COMPOSE_FILE}" ]]; then
  echo "Error: docker-compose.dev.yml not found at ${DEV_COMPOSE_FILE}" >&2
  exit 1
fi

content="$(<"${VERSION_FILE}")"
content="${content//$'\r'/}"

frontend=""
backend=""
if [[ "${content}" =~ \"frontend\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  frontend="${BASH_REMATCH[1]}"
fi
if [[ "${content}" =~ \"backend\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  backend="${BASH_REMATCH[1]}"
fi

flags_raw="{}"
if [[ "${content}" == *\"feature_flags\"* ]]; then
  rest="${content#*\"feature_flags\"}"
  rest="${rest#*:}"
  while [[ -n "${rest}" && "${rest:0:1}" =~ [[:space:]] ]]; do
    rest="${rest:1}"
  done
  if [[ "${rest:0:1}" == "{" ]]; then
    obj=""
    depth=0
    len=${#rest}
    for ((i = 0; i < len; i++)); do
      ch="${rest:i:1}"
      obj+="${ch}"
      case "${ch}" in
        '{') ((++depth)) ;; # prefix: exit 0 with set -e (postfix ++ fails when depth was 0)
        '}')
          ((depth--))
          if ((depth == 0)); then
            break
          fi
          ;;
      esac
    done
    if ((depth != 0)); then
      echo "Error: could not parse feature_flags object in VERSION.json (unbalanced braces)." >&2
      exit 1
    fi
    flags_raw="${obj//$'\n'/}"
    flags_raw="${flags_raw//$'\t'/}"
    flags_raw="${flags_raw// /}"
  fi
fi

if [[ -z "${frontend}" || -z "${backend}" ]]; then
  echo "Error: VERSION.json must contain non-empty frontend and backend string fields." >&2
  exit 1
fi

# YAML single-quoted value unless JSON contains a single quote (then double-quote + escapes)
if [[ "${flags_raw}" == *"'"* ]]; then
  esc="$(printf '%s' "${flags_raw}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  yaml_flags="\"${esc}\""
else
  yaml_flags="'${flags_raw}'"
fi

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT

while IFS= read -r line || [[ -n "${line}" ]]; do
  line="${line%$'\r'}"
  if [[ "${line}" =~ ^([[:space:]]*APP_VERSION:[[:space:]]*)(.*)$ ]]; then
    printf '%s%s\n' "${BASH_REMATCH[1]}" "${backend}"
  elif [[ "${line}" =~ ^([[:space:]]*FRONTEND_APP_VERSION:[[:space:]]*)(.*)$ ]]; then
    printf '%s%s\n' "${BASH_REMATCH[1]}" "${frontend}"
  elif [[ "${line}" =~ ^([[:space:]]*APP_FEATURE_FLAGS_JSON:[[:space:]]*)(.*)$ ]]; then
    printf '%s%s\n' "${BASH_REMATCH[1]}" "${yaml_flags}"
  else
    printf '%s\n' "${line}"
  fi
done < "${DEV_COMPOSE_FILE}" > "${tmp}"

mv "${tmp}" "${DEV_COMPOSE_FILE}"
trap - EXIT

echo "Synced docker-compose.dev.yml: backend=${backend}, frontend=${frontend}, feature_flags=${flags_raw}"
