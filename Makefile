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

# Use wrapper script if it exists, otherwise use docker compose directly
DC_WRAPPER = ./docker-compose-wrapper.sh -p $(PROJECT_NAME)
DC = docker compose -p $(PROJECT_NAME)
DC_DEV = docker compose -p $(PROJECT_NAME) -f $(COMPOSE_BASE) -f $(COMPOSE_DEV)

# ---------- Phony targets ----------
.PHONY: help up down restart dev build pull logs ps clean

# ---------- Help ----------
help:
	@echo ""
	@echo "Available commands:"
	@echo "  make up       - Start app (users / live images)"
	@echo "  make dev      - Start app in dev mode (local builds)"
	@echo "  make down     - Stop and remove containers"
	@echo "  make restart  - Restart all services"
	@echo "  make pull     - Pull latest images"
	@echo "  make build    - Build dev images"
	@echo "  make logs     - Follow logs"
	@echo "  make ps       - Show running containers"
	@echo "  make clean    - Stop app and remove volumes"
	@echo ""

# ---------- User / live ----------
up:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) up -d; \
	else \
		$(DC) -f $(COMPOSE_BASE) up -d; \
	fi

pull:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) pull; \
	else \
		$(DC) -f $(COMPOSE_BASE) pull; \
	fi

restart:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) restart; \
	else \
		$(DC) -f $(COMPOSE_BASE) restart; \
	fi

# ---------- Dev ----------
dev:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) -f $(COMPOSE_BASE) -f $(COMPOSE_DEV) up -d --build; \
	else \
		$(DC_DEV) up -d --build; \
	fi

build:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) -f $(COMPOSE_BASE) -f $(COMPOSE_DEV) build; \
	else \
		$(DC_DEV) build; \
	fi

# ---------- Shared ----------
down:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) down; \
	else \
		$(DC) down; \
	fi

logs:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) logs -f; \
	else \
		$(DC) logs -f; \
	fi

ps:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) ps; \
	else \
		$(DC) ps; \
	fi

# ---------- Danger zone ----------
clean:
	@if [ -f docker-compose-wrapper.sh ]; then \
		$(DC_WRAPPER) down -v; \
	else \
		$(DC) down -v; \
	fi
