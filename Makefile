# ---------- Configuration ----------
# Detect OS and set appropriate shell
# On Windows, find Git Bash explicitly to avoid WSL bash issues
# On Unix, use /bin/bash as the default shell
ifeq ($(OS),Windows_NT)
    # Windows: Find Git Bash explicitly (avoid WSL bash)
    # Use PowerShell to find Git Bash in common locations
    BASH := $(shell powershell -NoProfile -Command "if (Test-Path 'C:\Program Files\Git\bin\bash.exe') { 'C:/Program Files/Git/bin/bash.exe' } elseif (Test-Path 'C:\Program Files (x86)\Git\bin\bash.exe') { 'C:/Program Files (x86)/Git/bin/bash.exe' } else { 'bash' }" 2>nul)
    # If detection failed or returned empty, default to bash (will show error if not found)
    BASH := $(if $(BASH),$(BASH),bash)
    # Don't override SHELL, we'll explicitly use $(BASH) in commands
    # Note: Paths with spaces will be handled by quoting $(BASH) in commands
else
    # Unix-like systems
    SHELL := /bin/bash
    BASH := /bin/bash
endif

COMPOSE_BASE = docker-compose.yml
COMPOSE_DEV  = docker-compose.dev.yml

# Function to get docker compose command
# Uses local binary if available, otherwise falls back to system docker compose
define get_docker_compose
	@if [ -f ./bin/docker-compose ] && [ -x ./bin/docker-compose ]; then \
		echo "./bin/docker-compose"; \
	elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
		echo "docker compose"; \
	elif command -v docker-compose >/dev/null 2>&1; then \
		echo "docker-compose"; \
	else \
		echo "docker compose"; \
	fi
endef

# Use local docker compose binary if it exists, otherwise use system docker compose
# Cross-platform version that works on both Windows and Unix
DC_BIN_RAW = $(shell "$(BASH)" -c "if [ -f ./bin/docker-compose ] && [ -x ./bin/docker-compose ]; then echo './bin/docker-compose'; elif [ -f ./docker-compose ] && [ -x ./docker-compose ]; then echo './docker-compose'; elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then echo 'docker compose'; elif command -v docker-compose >/dev/null 2>&1; then echo 'docker-compose'; else echo 'docker compose'; fi" 2>/dev/null || echo "docker compose")

# Helper to detect if DC_BIN_RAW is "docker compose" (contains space)
space :=
space +=
IS_DOCKER_COMPOSE = $(findstring $(space),$(DC_BIN_RAW))

# On Windows, "docker compose" must be executed via bash to handle multi-word commands
ifeq ($(OS),Windows_NT)
ifneq ($(IS_DOCKER_COMPOSE),)
# It's "docker compose" - we'll execute it via bash in recipes
# Store just the base command for reference
DC_CMD = docker compose
else
# Single word command (docker-compose or ./bin/docker-compose)
DC = $(DC_BIN_RAW) -f $(COMPOSE_BASE)
DC_DEV = $(DC_BIN_RAW) -f $(COMPOSE_BASE) -f $(COMPOSE_DEV)
endif
else
# Unix: Use directly - Make handles spaces correctly
DC = $(DC_BIN_RAW) -f $(COMPOSE_BASE)
DC_DEV = $(DC_BIN_RAW) -f $(COMPOSE_BASE) -f $(COMPOSE_DEV)
endif

# ---------- Phony targets ----------
.PHONY: help up dev ensure-keyfile ensure-env download-setup-scripts bootstrap-download-script bootstrap-version-tracker update-files sync-dev-compose-versions

# ---------- Help ----------
help:
	@echo ""
	@echo "Available commands:"
	@echo "  make up               - Start app (users / live images)"
	@echo "  make update-files     - Updates all necessary files from GitHub"
	@echo "  make dev              - Dev mode: local builds + docker-compose.dev.yml (needs git clone; not downloaded by make up)"
	@echo "                        Optional in .env for baked-in feedback/Sentry (same as CI build-args):"
	@echo "                        FEEDBACK_DISCORD_WEBHOOK_URL, SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT_ID,"
	@echo "                        SENTRY_AUTH_TOKEN (source maps), SENTRY_TRACES_SAMPLE_RATE, ENVIRONMENT"
	@echo "  make help            - Show this help message"
	@echo ""
	@echo "For detailed deployment instructions, see DEPLOYMENT.md"
	@echo ""

# ---------- Prerequisites ----------
# Bootstrap: Download download-setup-scripts.sh if it doesn't exist
bootstrap-download-script:
	@"$(BASH)" -c "if [ ! -f ./scripts/download-setup-scripts.sh ]; then \
		echo 'Bootstrap: Downloading download-setup-scripts.sh from GitHub...'; \
		mkdir -p ./scripts; \
		if command -v curl >/dev/null 2>&1; then \
			curl -L -f -o ./scripts/download-setup-scripts.sh \
				'https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public/scripts/download-setup-scripts.sh' || \
			(echo 'Error: Failed to download download-setup-scripts.sh from GitHub' >&2; exit 1); \
		elif command -v wget >/dev/null 2>&1; then \
			wget -O ./scripts/download-setup-scripts.sh \
				'https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public/scripts/download-setup-scripts.sh' || \
			(echo 'Error: Failed to download download-setup-scripts.sh from GitHub' >&2; exit 1); \
		else \
			echo 'Error: Neither curl nor wget is available. Please install one of them.' >&2; \
			exit 1; \
		fi; \
		chmod +x ./scripts/download-setup-scripts.sh; \
		echo 'Bootstrap: download-setup-scripts.sh downloaded and made executable'; \
	fi"

download-setup-scripts: bootstrap-download-script
	@"$(BASH)" ./scripts/download-setup-scripts.sh

ensure-keyfile:
	@"$(BASH)" ./scripts/generate-mongo-keyfile.sh

ensure-env:
	@"$(BASH)" -c "if [ ! -f .env ]; then \
		echo 'Error: .env file is missing!' >&2; \
		echo '' >&2; \
		echo 'Downloading env.example from GitHub and creating .env file...' >&2; \
		if command -v curl >/dev/null 2>&1; then \
			curl -L -f -o .env \
				'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/env.example' || \
			(echo 'Error: Failed to download env.example from GitHub' >&2; exit 1); \
		elif command -v wget >/dev/null 2>&1; then \
			wget -O .env \
				'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/env.example' || \
			(echo 'Error: Failed to download env.example from GitHub' >&2; exit 1); \
		else \
			echo 'Error: Neither curl nor wget is available. Please install one of them.' >&2; \
			exit 1; \
		fi; \
		echo '' >&2; \
		echo '.env file created from env.example' >&2; \
		echo '' >&2; \
		echo 'Please open .env and modify it with your configuration values.' >&2; \
		echo 'Then run \"make up\" again.' >&2; \
		echo '' >&2; \
		exit 1; \
	fi"

# ---------- User / live ----------
up: download-setup-scripts ensure-keyfile ensure-env
ifeq ($(OS),Windows_NT)
	@"$(BASH)" -c 'DC_CMD=$$(if [ -f ./bin/docker-compose ] && [ -x ./bin/docker-compose ]; then echo "./bin/docker-compose"; elif [ -f ./docker-compose ] && [ -x ./docker-compose ]; then echo "./docker-compose"; elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then echo "docker compose"; elif command -v docker-compose >/dev/null 2>&1; then echo "docker-compose"; else echo "docker compose"; fi); eval "$$DC_CMD -f $(COMPOSE_BASE) up -d"'
else
	@$(DC) up -d
endif

# ---------- Dev ----------
sync-dev-compose-versions:
	@"$(BASH)" ./scripts/sync-dev-compose-versions.sh

dev: download-setup-scripts ensure-keyfile ensure-env sync-dev-compose-versions
ifeq ($(OS),Windows_NT)
	@"$(BASH)" -c 'DC_CMD=$$(if [ -f ./bin/docker-compose ] && [ -x ./bin/docker-compose ]; then echo "./bin/docker-compose"; elif [ -f ./docker-compose ] && [ -x ./docker-compose ]; then echo "./docker-compose"; elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then echo "docker compose"; elif command -v docker-compose >/dev/null 2>&1; then echo "docker-compose"; else echo "docker compose"; fi); eval "$$DC_CMD -f $(COMPOSE_BASE) -f $(COMPOSE_DEV) up -d --build"'
else
	@$(DC_DEV) up -d --build
endif

# Bootstrap: Download version-tracker.sh if it doesn't exist
bootstrap-version-tracker:
	@"$(BASH)" -c "if [ ! -f ./scripts/version-tracker.sh ]; then \
		echo 'Bootstrap: Downloading version-tracker.sh from GitHub...'; \
		mkdir -p ./scripts; \
		if command -v curl >/dev/null 2>&1; then \
			curl -L -f -o ./scripts/version-tracker.sh \
				'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/scripts/version-tracker.sh' || \
			(echo 'Error: Failed to download version-tracker.sh from GitHub' >&2; exit 1); \
		elif command -v wget >/dev/null 2>&1; then \
			wget -O ./scripts/version-tracker.sh \
				'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/scripts/version-tracker.sh' || \
			(echo 'Error: Failed to download version-tracker.sh from GitHub' >&2; exit 1); \
		else \
			echo 'Error: Neither curl nor wget is available. Please install one of them.' >&2; \
			exit 1; \
		fi; \
		chmod +x ./scripts/version-tracker.sh; \
		echo 'Bootstrap: version-tracker.sh downloaded and made executable'; \
	fi"

# ---------- Update Files ----------
update-files: bootstrap-version-tracker
	@"$(BASH)" -c "echo 'Updating files from GitHub...' >&2; \
	echo '' >&2; \
	echo 'Updating Makefile...' >&2; \
	TEMP_FILE='Makefile.tmp'; \
	if command -v curl >/dev/null 2>&1; then \
		curl -L -f -o \"\$$TEMP_FILE\" \
			'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/Makefile' || \
		(echo 'Error: Failed to download Makefile from GitHub' >&2; rm -f \"\$$TEMP_FILE\"; exit 1); \
	elif command -v wget >/dev/null 2>&1; then \
		wget -O \"\$$TEMP_FILE\" \
			'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/Makefile' || \
		(echo 'Error: Failed to download Makefile from GitHub' >&2; rm -f \"\$$TEMP_FILE\"; exit 1); \
	else \
		echo 'Error: Neither curl nor wget is available. Please install one of them.' >&2; \
		exit 1; \
	fi; \
	mv \"\$$TEMP_FILE\" Makefile; \
	echo 'Makefile updated successfully!' >&2; \
	echo '' >&2; \
	echo 'Updating version-tracker.sh...' >&2; \
	TEMP_FILE='./scripts/version-tracker.sh.tmp'; \
	if command -v curl >/dev/null 2>&1; then \
		curl -L -f -o \"\$$TEMP_FILE\" \
			'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/scripts/version-tracker.sh' || \
		(echo 'Error: Failed to download version-tracker.sh from GitHub' >&2; rm -f \"\$$TEMP_FILE\"; exit 1); \
	elif command -v wget >/dev/null 2>&1; then \
		wget -O \"\$$TEMP_FILE\" \
			'https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/scripts/version-tracker.sh' || \
		(echo 'Error: Failed to download version-tracker.sh from GitHub' >&2; rm -f \"\$$TEMP_FILE\"; exit 1); \
	else \
		echo 'Error: Neither curl nor wget is available. Please install one of them.' >&2; \
		exit 1; \
	fi; \
	mv \"\$$TEMP_FILE\" ./scripts/version-tracker.sh; \
	chmod +x ./scripts/version-tracker.sh; \
	echo 'version-tracker.sh updated successfully!' >&2; \
	echo '' >&2; \
	echo 'Updating tracked repo files (compose, scripts, observability)...' >&2; \
	bash ./scripts/version-tracker.sh update"
