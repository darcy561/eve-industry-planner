# ---------- Configuration ----------
# Use bash on Windows (Git Bash) or system bash on Linux/Unix
# On Windows, make uses cmd.exe by default, so we need to explicitly set bash
ifeq ($(OS),Windows_NT)
  # Windows: Use Git Bash (short path to avoid spaces)
  SHELL := C:/Progra~1/Git/bin/bash.exe
else
  # Linux/Unix: Use system bash
  SHELL := /bin/bash
endif
COMPOSE_BASE = docker-compose.yml
COMPOSE_DEV  = docker-compose.dev.yml
PROJECT_NAME = eve-industry-planner

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
DC_BIN = $(shell if [ -f ./docker-compose ] && [ -x ./docker-compose ]; then echo "./docker-compose"; elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then echo "docker compose"; elif command -v docker-compose >/dev/null 2>&1; then echo "docker-compose"; else echo "docker compose"; fi)
DC = $(DC_BIN) -p $(PROJECT_NAME)
DC_DEV = $(DC_BIN) -p $(PROJECT_NAME) -f $(COMPOSE_BASE) -f $(COMPOSE_DEV)

# ---------- Phony targets ----------
.PHONY: help up dev ensure-keyfile ensure-env download-setup-scripts bootstrap-download-script

# ---------- Help ----------
help:
	@echo ""
	@echo "Available commands:"
	@echo "  make help     - Show this help message"
	@echo "  make up       - Start app (users / live images)"
	@echo "  make dev      - Start app in develpoment mode (Designed for use with local builds)"
	@echo ""
	@echo "For detailed deployment instructions, see DEPLOYMENT.md"
	@echo ""

# ---------- Prerequisites ----------
# Bootstrap: Download download-setup-scripts.sh if it doesn't exist
bootstrap-download-script:
	@if [ ! -f ./scripts/download-setup-scripts.sh ]; then \
		echo "Bootstrap: Downloading download-setup-scripts.sh from GitHub..."; \
		mkdir -p ./scripts; \
		if command -v curl >/dev/null 2>&1; then \
			curl -L -f -o ./scripts/download-setup-scripts.sh \
				"https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public/scripts/download-setup-scripts.sh" || \
			(echo "Error: Failed to download download-setup-scripts.sh from GitHub" >&2; exit 1); \
		elif command -v wget >/dev/null 2>&1; then \
			wget -O ./scripts/download-setup-scripts.sh \
				"https://raw.githubusercontent.com/darcy561/eve-industry-planner/Public/scripts/download-setup-scripts.sh" || \
			(echo "Error: Failed to download download-setup-scripts.sh from GitHub" >&2; exit 1); \
		else \
			echo "Error: Neither curl nor wget is available. Please install one of them." >&2; \
			exit 1; \
		fi; \
		chmod +x ./scripts/download-setup-scripts.sh; \
		echo "Bootstrap: download-setup-scripts.sh downloaded and made executable"; \
	fi

download-setup-scripts: bootstrap-download-script
	@./scripts/download-setup-scripts.sh

ensure-keyfile:
	@./scripts/generate-mongo-keyfile.sh

ensure-env:
	@if [ ! -f .env ]; then \
		echo "Error: .env file is missing!" >&2; \
		echo "" >&2; \
		echo "Downloading env.example from GitHub and creating .env file..." >&2; \
		if command -v curl >/dev/null 2>&1; then \
			curl -L -f -o .env \
				"https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/env.example" || \
			(echo "Error: Failed to download env.example from GitHub" >&2; exit 1); \
		elif command -v wget >/dev/null 2>&1; then \
			wget -O .env \
				"https://raw.githubusercontent.com/darcy561/eve-industry-planner/refs/heads/Public/env.example" || \
			(echo "Error: Failed to download env.example from GitHub" >&2; exit 1); \
		else \
			echo "Error: Neither curl nor wget is available. Please install one of them." >&2; \
			exit 1; \
		fi; \
		echo "" >&2; \
		echo ".env file created from env.example" >&2; \
		echo "" >&2; \
		echo "Please open .env and modify it with your configuration values." >&2; \
		echo "Then run 'make up' again." >&2; \
		echo "" >&2; \
		exit 1; \
	fi

# ---------- User / live ----------
up: download-setup-scripts ensure-keyfile ensure-env
	@$(DC) -f $(COMPOSE_BASE) up -d

# ---------- Dev ----------
dev: ensure-keyfile ensure-env
	@$(DC_DEV) up -d --build
