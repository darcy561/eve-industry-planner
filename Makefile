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
.PHONY: help up dev ensure-keyfile download-setup-scripts

# ---------- Help ----------
help:
	@echo ""
	@echo "Available commands:"
	@echo "  make help     - Show this help message"
	@echo "  make up       - Start app (users / live images)"
	@echo "  make dev      - Start app in dev mode (local builds)"
	@echo ""
	@echo "For detailed deployment instructions, see DEPLOYMENT.md"
	@echo ""

# ---------- Prerequisites ----------
download-setup-scripts:
	@./scripts/download-setup-scripts.sh

ensure-keyfile:
	@./scripts/generate-mongo-keyfile.sh

# ---------- User / live ----------
up: download-setup-scripts ensure-keyfile
	@$(DC) -f $(COMPOSE_BASE) up -d

# ---------- Dev ----------
dev: ensure-keyfile
	@$(DC_DEV) up -d --build
