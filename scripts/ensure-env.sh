#!/bin/bash
# Create .env from remote env.example when missing (same behavior as Makefile ensure-env).
# Kept in a script so Windows GNU Make does not run this via cmd.exe (nested quotes break).

if [ ! -f .env ]; then
	echo 'Error: .env file is missing!' >&2
	echo '' >&2
	echo 'Downloading env.example from GitHub and creating .env file...' >&2
	if command -v curl >/dev/null 2>&1; then
		curl -L -f -o .env \
			'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/env.example' ||
			(echo 'Error: Failed to download env.example from GitHub' >&2; exit 1)
	elif command -v wget >/dev/null 2>&1; then
		wget -O .env \
			'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/env.example' ||
			(echo 'Error: Failed to download env.example from GitHub' >&2; exit 1)
	else
		echo 'Error: Neither curl nor wget is available. Please install one of them.' >&2
		exit 1
	fi
	if grep -q '^AUTHZ_HMAC_KEY=auto-generate-me$' .env || ! grep -q '^AUTHZ_HMAC_KEY=' .env; then
		GEN_AUTHZ_HMAC_KEY="$(
			if command -v openssl >/dev/null 2>&1; then
				openssl rand -base64 48 | tr -d '\n' | tr '+/' '-_' | tr -d '='
			else
				LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 64
			fi
		)"
		if grep -q '^AUTHZ_HMAC_KEY=' .env; then
			sed -i.bak "s|^AUTHZ_HMAC_KEY=.*|AUTHZ_HMAC_KEY=${GEN_AUTHZ_HMAC_KEY}|" .env && rm -f .env.bak
		else
			printf '\nAUTHZ_HMAC_KEY=%s\n' "${GEN_AUTHZ_HMAC_KEY}" >>.env
		fi
		echo 'Generated AUTHZ_HMAC_KEY in .env' >&2
		RED=$'\033[1;31m'
		NC=$'\033[0m'
		printf '%s==============================================================%s\n' "${RED}" "${NC}" >&2
		printf '%s IMPORTANT: BACK UP THIS AUTHZ_HMAC_KEY NOW %s\n' "${RED}" "${NC}" >&2
		printf '%s This key is required to reproduce deterministic internal refs. %s\n' "${RED}" "${NC}" >&2
		printf '%s If you lose it, existing refs may no longer be derivable. %s\n' "${RED}" "${NC}" >&2
		printf '%s AUTHZ_HMAC_KEY=%s %s\n' "${RED}" "${GEN_AUTHZ_HMAC_KEY}" "${NC}" >&2
		printf '%s==============================================================%s\n' "${RED}" "${NC}" >&2
		if [ -t 0 ]; then
			printf '%s Type YES after safely storing this key to continue: %s' "${RED}" "${NC}" >&2
			read -r CONFIRM_AUTHZ_HMAC_KEY
			if [ "${CONFIRM_AUTHZ_HMAC_KEY}" != "YES" ]; then
				echo 'Aborting: confirmation not received. Re-run after safely storing AUTHZ_HMAC_KEY.' >&2
				exit 1
			fi
		else
			echo 'Aborting: interactive confirmation required to continue after generating AUTHZ_HMAC_KEY.' >&2
			echo 'Re-run in an interactive terminal and type YES when prompted.' >&2
			exit 1
		fi
	fi
	for SECRET_KEY in MONGO_ROOT_PASSWORD MONGO_PASSWORD REDIS_PASSWORD; do
		CURRENT_VAL="$(awk -F= -v k="${SECRET_KEY}" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' .env)"
		NEEDS_GEN=0
		case "${SECRET_KEY}" in
		MONGO_ROOT_PASSWORD)
			{ [ -z "${CURRENT_VAL}" ] || [ "${CURRENT_VAL}" = "auto-generate-me" ] || [ "${CURRENT_VAL}" = "change-this-root-password" ]; } && NEEDS_GEN=1
			;;
		MONGO_PASSWORD)
			{ [ -z "${CURRENT_VAL}" ] || [ "${CURRENT_VAL}" = "auto-generate-me" ] || [ "${CURRENT_VAL}" = "EXAMPLE_USERNAME" ]; } && NEEDS_GEN=1
			;;
		REDIS_PASSWORD)
			{ [ -z "${CURRENT_VAL}" ] || [ "${CURRENT_VAL}" = "auto-generate-me" ] || [ "${CURRENT_VAL}" = "change-this-redis-password" ]; } && NEEDS_GEN=1
			;;
		esac
		if [ "${NEEDS_GEN}" -eq 1 ]; then
			GEN_SECRET="$(
				if command -v openssl >/dev/null 2>&1; then
					openssl rand -base64 36 | tr -d '\n' | tr '+/' '-_' | tr -d '='
				else
					LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48
				fi
			)"
			if grep -q "^${SECRET_KEY}=" .env; then
				sed -i.bak "s|^${SECRET_KEY}=.*|${SECRET_KEY}=${GEN_SECRET}|" .env && rm -f .env.bak
			else
				printf '\n%s=%s\n' "${SECRET_KEY}" "${GEN_SECRET}" >>.env
			fi
			echo "Generated ${SECRET_KEY} in .env" >&2
		fi
	done
	echo '' >&2
	echo '.env file created from env.example' >&2
	echo '' >&2
	echo 'Please open .env and modify it with your configuration values.' >&2
	echo 'Then run "make up" again.' >&2
	echo '' >&2
	exit 1
fi
