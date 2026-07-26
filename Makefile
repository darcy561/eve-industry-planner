# ---------- Configuration ----------
# Detect OS and set appropriate shell
# On Windows, find Git Bash explicitly to avoid WSL bash issues
# On Unix, use /bin/bash as the default shell
ifeq ($(OS),Windows_NT)
    # Windows: Find Git Bash explicitly (avoid WSL bash)
    # Redirect inside PowerShell only — `2>nul` under Make's $(shell)/sh creates a file named nul (Windows reserved).
    BASH := $(shell powershell -NoProfile -Command "$$ErrorActionPreference='SilentlyContinue'; if (Test-Path 'C:\Program Files\Git\bin\bash.exe') { 'C:/Program Files/Git/bin/bash.exe' } elseif (Test-Path 'C:\Program Files (x86)\Git\bin\bash.exe') { 'C:/Program Files (x86)/Git/bin/bash.exe' } else { 'bash' }")
    BASH := $(if $(BASH),$(BASH),bash)
else
    SHELL := /bin/bash
    BASH := /bin/bash
endif

help:
	@echo ""
	@echo "Server install (published images)"
	@echo "  make up                  Start or recover the app"
	@echo "  make status              Show whether the app is running"
	@echo "  make logs                Show logs (you will pick what to view)"
	@echo "  make cli                 Open a shell in the app (for support)"
	@echo ""
	@echo "  make swarm-sync          Apply settings from eip.config.yaml"
	@echo "  make swarm-secrets-sync  Apply secret changes from .env"
	@echo "  make update-files        Pull latest Makefile and scripts"
	@echo "  make release             Roll out a new APP_VERSION from .env"
	@echo ""
	@echo "  make restart             Restart the app (you will pick what to restart)"
	@echo "  make shutdown            Stop the app (keeps your data)"
	@echo ""
	@echo "  make help                Show this list"
	@echo ""
	@echo "  Tip: make update-files, set APP_VERSION in .env, then make release"
	@echo "  Local development commands: make help-dev"
	@echo ""

help-dev:
	@echo ""
	@echo "Local development (git clone on your machine)"
	@echo "  make dev                 Start with local builds (not for production)"
	@echo "  make swarm-sync          Apply settings from eip.config.yaml"
	@echo "  make swarm-secrets-sync  Apply secret changes from .env"
	@echo "  make dev-release         Roll out a new APP_VERSION (local images)"
	@echo "  make rebuild             Rebuild and roll app services"
	@echo "  make update-data SERVICE=seaweedfs|prometheus"
	@echo "                           Update one data-layer service (e.g. object store)"
	@echo ""
	@echo "Ops helpers"
	@echo "  make advertise           Push version to Redis only (escape hatch)"
	@echo "  make cli ARGS='list'     Run a core tasks command"
	@echo "  make ws-placement-ops ARGS=..."
	@echo "                           Websocket placement ops (cordon, evacuate, …)"
	@echo "  make app-version-ops ARGS=..."
	@echo "                           Manual Redis version get|set|clear"
	@echo "  make smoke-ws-placement  Quick websocket placement check"
	@echo "  make stack-rm            Remove the eip Swarm stack"
	@echo "  make help-dev            Show this list"
	@echo ""
	@echo "  Tip: for a normal server install use make up"
	@echo "  Tip: set APP_VERSION in .env, then run make dev-release"
	@echo "  Tip: EIP_VERBOSE=1 for detailed bake/deploy/secrets logs"
	@echo "  Server commands: make help"
	@echo ""

# Chicken-egg: bare server may lack scripts/ — curl one bootstrap file, then it pulls the rest.
bootstrap-download-script:
	@"$(BASH)" -c "if [ ! -f ./scripts/bootstrap/download-setup-scripts.sh ]; then \
		echo 'Bootstrap: Downloading download-setup-scripts.sh from GitHub...'; \
		mkdir -p ./scripts/bootstrap; \
		if command -v curl >/dev/null 2>&1; then \
			curl -L -f -o ./scripts/bootstrap/download-setup-scripts.sh \
				'https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public/scripts/bootstrap/download-setup-scripts.sh' || \
			(echo 'Error: Failed to download download-setup-scripts.sh from GitHub' >&2; exit 1); \
		elif command -v wget >/dev/null 2>&1; then \
			wget -O ./scripts/bootstrap/download-setup-scripts.sh \
				'https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public/scripts/bootstrap/download-setup-scripts.sh' || \
			(echo 'Error: Failed to download download-setup-scripts.sh from GitHub' >&2; exit 1); \
		else \
			echo 'Error: Neither curl nor wget is available. Please install one of them.' >&2; \
			exit 1; \
		fi; \
		chmod +x ./scripts/bootstrap/download-setup-scripts.sh; \
		echo 'Bootstrap: download-setup-scripts.sh downloaded and made executable'; \
	fi"

download-setup-scripts: bootstrap-download-script
	@"$(BASH)" ./scripts/bootstrap/download-setup-scripts.sh

ensure-keyfile:
	@"$(BASH)" ./scripts/bootstrap/generate-mongo-keyfile.sh

ensure-env:
	@"$(BASH)" ./scripts/bootstrap/ensure-env.sh

ensure-s3-env: ensure-env
	@"$(BASH)" ./scripts/bootstrap/ensure-s3-env.sh

ensure-refresh-token-key:
	@"$(BASH)" ./scripts/bootstrap/ensure-refresh-token-key.sh

ensure-app-version:
	@"$(BASH)" ./scripts/swarm/ensure-app-version.sh

ensure-eip-network:
	@"$(BASH)" ./scripts/swarm/ensure-eip-network.sh

ensure-swarm:
	@"$(BASH)" ./scripts/swarm/ensure-swarm.sh

ensure-eip-overlay: ensure-swarm
	@"$(BASH)" ./scripts/swarm/ensure-eip-overlay.sh

# .env → Swarm secrets + rematerialize stack (rolls elastic services). Not YAML.
swarm-secrets-sync: ensure-s3-env ensure-app-version
	@"$(BASH)" ./scripts/swarm/swarm-secrets-sync.sh $(ARGS)

# One data-layer Swarm service (docker-stack.data.yml). Never app train.
update-data: ensure-s3-env ensure-app-version
	@"$(BASH)" -c 'export SERVICE="$(SERVICE)"; ./scripts/swarm/update-data.sh $(ARGS)'

# eip.config.yaml → targeted service updates (default). Not a version ship.
swarm-sync: ensure-env ensure-app-version
	@"$(BASH)" ./scripts/swarm/swarm-sync.sh $(ARGS)

# Local bake (cache) + roll only when image changed. SERVICES= optional subset. No advertise.
rebuild: ensure-env ensure-app-version
	@"$(BASH)" -c 'export SERVICES="$(SERVICES)"; ./scripts/swarm/rebuild.sh $(ARGS)'

# .env APP_VERSION → GHCR pull/roll + Redis advertise.
release: ensure-env ensure-app-version
	@"$(BASH)" -c 'export SERVICES="$(SERVICES)"; ./scripts/swarm/release.sh --ghcr $(ARGS)'

# .env APP_VERSION → local bake/roll + Redis advertise.
dev-release: ensure-env ensure-app-version
	@"$(BASH)" -c 'export SERVICES="$(SERVICES)"; ./scripts/swarm/release.sh --local $(ARGS)'

# Redis advertise only (images already running).
advertise: ensure-env ensure-app-version
	@"$(BASH)" ./scripts/ops/advertise.sh $(ARGS)

stack-rm:
	@"$(BASH)" -c 'docker stack rm "$${EIP_STACK_NAME:-eip}"'

smoke-ws-placement:
	@"$(BASH)" ./scripts/test/smoke-ws-placement.sh

ws-placement-ops:
	@"$(BASH)" ./scripts/ops/ws-placement-ops.sh $(ARGS)

app-version-ops:
	@"$(BASH)" ./scripts/ops/app-version-ops.sh $(ARGS)

# Shell or one-shot (ARGS=/CMD=) on the running core task after handoff.
cli:
	@"$(BASH)" -c 'export CMD="$(CMD)"; ./scripts/ops/core-cli.sh $(ARGS)'

# Day-to-day ops. shutdown keeps volumes.
status:
	@"$(BASH)" ./scripts/swarm/status.sh

logs:
	@"$(BASH)" -c 'export SERVICE="$(SERVICE)"; export ARGS="$(ARGS)"; ./scripts/swarm/logs.sh'

restart:
	@"$(BASH)" -c 'export SERVICE="$(SERVICE)"; ./scripts/swarm/restart.sh $(ARGS)'

shutdown:
	@"$(BASH)" ./scripts/swarm/shutdown.sh $(ARGS)

# Live bring-up: Swarm data + app (GHCR). Obs addon: docker-stack.obs.yml (separate).
up: download-setup-scripts ensure-keyfile ensure-env ensure-s3-env ensure-app-version ensure-refresh-token-key ensure-eip-overlay
	@"$(BASH)" ./scripts/swarm/stack-deploy.sh

# Local bring-up: bake, then Swarm data + app with dev overlay.
dev: download-setup-scripts ensure-keyfile ensure-env ensure-s3-env ensure-app-version ensure-refresh-token-key ensure-eip-overlay
	@"$(BASH)" ./scripts/swarm/bake-local.sh
	@"$(BASH)" ./scripts/swarm/stack-deploy.sh --dev

update-files:
	@"$(BASH)" ./scripts/bootstrap/update-files.sh
