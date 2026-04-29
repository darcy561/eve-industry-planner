#!/bin/bash

if [ ! -f .env ]; then
	echo "Skipping REFRESH_TOKEN_AES_KEY generation: .env is missing (run make ensure-env first)." >&2
	exit 0
fi

CURRENT_VAL="$(awk -F= '/^REFRESH_TOKEN_AES_KEY=/{sub(/^[^=]*=/, ""); print; exit}' .env)"

if [ -n "${CURRENT_VAL}" ] && [ "${CURRENT_VAL}" != "auto-generate-me" ]; then
	exit 0
fi

GEN_KEY="$(
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -base64 32 | tr -d '\n'
	else
		LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 44
	fi
)"

awk -v key="${GEN_KEY}" '
BEGIN { updated = 0 }
/^REFRESH_TOKEN_AES_KEY=/ {
	print "REFRESH_TOKEN_AES_KEY=" key
	updated = 1
	next
}
{ print }
END {
	if (!updated) {
		print "REFRESH_TOKEN_AES_KEY=" key
	}
}
' .env > .env.tmp && mv .env.tmp .env

echo "Generated REFRESH_TOKEN_AES_KEY in .env" >&2
