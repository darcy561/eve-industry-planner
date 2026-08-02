# Local Swarm app images (#35). Used by eip dev / eip rebuild (admintool/internal/images).
# Bake always tags :${BAKE_WORKING_TAG} (default "bake"). Promote a
# per-role TAG_* only when that role's :bake image digest changes.
#
#   docker buildx bake -f docker-bake.hcl swarm
#   docker buildx bake -f docker-bake.hcl api websocket

variable "APP_VERSION" {
  default = "0.0.0"
}

# Stable working tag only — not the train/release tag.
variable "BAKE_WORKING_TAG" {
  default = "bake"
}

variable "ENVIRONMENT" {
  default = "development"
}

variable "SENTRY_DSN" {
  default = ""
}

variable "SENTRY_TRACES_SAMPLE_RATE" {
  default = ""
}

variable "FEEDBACK_DISCORD_WEBHOOK_URL" {
  default = ""
}

variable "APP_FEATURE_FLAGS_JSON" {
  default = "{\"enable_upcoming_changes_page\":false}"
}

variable "SENTRY_ORG" {
  default = ""
}

variable "SENTRY_PROJECT_ID" {
  default = ""
}

variable "SENTRY_AUTH_TOKEN" {
  default = ""
}

variable "SENTRY_ERROR_SAMPLE_RATE" {
  default = ""
}

# eip CLI version (host binary ldflag). Source module folder is admintool/.
# Swarm stack/networks stay "eip". Command prefix / binary: eip / eip.exe.
# Target "admintool" (container image) is legacy/deferred — product path is host
# via admintool-windows / admintool-linux (or scripts/admintool/build-host.*).
variable "EIP_CLI_VERSION" {
  default = "0.0.0-dev"
}

variable "ADMINTOOL_IMAGE" {
  default = "ghcr.io/darcy561/eve-industry-planner-admintool"
}

group "swarm" {
  targets = ["api", "websocket", "worker", "ws-router", "core", "frontend"]
}

# Legacy/deferred container image — not the operator runtime.
target "admintool" {
  context    = "./admintool"
  dockerfile = "Dockerfile"
  tags = [
    "eve-industry-planner-admintool:${EIP_CLI_VERSION}",
    "${ADMINTOOL_IMAGE}:${EIP_CLI_VERSION}",
  ]
  args = {
    EIP_CLI_VERSION = EIP_CLI_VERSION
  }
}

# Host binaries → repo root (eip.exe / eip). Prefer: .\scripts\admintool\build-host.ps1
target "admintool-windows" {
  context    = "./admintool"
  dockerfile = "Dockerfile"
  target     = "host-windows"
  output     = ["type=local,dest=."]
  args = {
    EIP_CLI_VERSION = EIP_CLI_VERSION
  }
}

target "admintool-linux" {
  context    = "./admintool"
  dockerfile = "Dockerfile"
  target     = "host-linux"
  output     = ["type=local,dest=."]
  args = {
    EIP_CLI_VERSION = EIP_CLI_VERSION
  }
}

target "api" {
  context    = "./services"
  dockerfile = "api/Dockerfile"
  tags       = ["eve-industry-planner-api:${BAKE_WORKING_TAG}"]
  args = {
    APP_VERSION                  = APP_VERSION
    FRONTEND_APP_VERSION         = APP_VERSION
    APP_FEATURE_FLAGS_JSON       = APP_FEATURE_FLAGS_JSON
    ENVIRONMENT                  = ENVIRONMENT
    SENTRY_DSN                   = SENTRY_DSN
    SENTRY_TRACES_SAMPLE_RATE    = SENTRY_TRACES_SAMPLE_RATE
    FEEDBACK_DISCORD_WEBHOOK_URL = FEEDBACK_DISCORD_WEBHOOK_URL
  }
}

target "websocket" {
  context    = "./services"
  dockerfile = "websocket/Dockerfile"
  tags       = ["eve-industry-planner-websocket:${BAKE_WORKING_TAG}"]
  args = {
    APP_VERSION               = APP_VERSION
    ENVIRONMENT               = ENVIRONMENT
    SENTRY_DSN                = SENTRY_DSN
    SENTRY_TRACES_SAMPLE_RATE = SENTRY_TRACES_SAMPLE_RATE
  }
}

target "worker" {
  context    = "./services"
  dockerfile = "worker/Dockerfile"
  tags       = ["eve-industry-planner-worker:${BAKE_WORKING_TAG}"]
  args = {
    APP_VERSION               = APP_VERSION
    ENVIRONMENT               = ENVIRONMENT
    SENTRY_DSN                = SENTRY_DSN
    SENTRY_TRACES_SAMPLE_RATE = SENTRY_TRACES_SAMPLE_RATE
  }
}

target "ws-router" {
  context    = "./services"
  dockerfile = "ws-router/Dockerfile"
  tags       = ["eve-industry-planner-ws-router:${BAKE_WORKING_TAG}"]
}

target "core" {
  context    = "./services"
  dockerfile = "core/Dockerfile"
  tags       = ["eve-industry-planner-core:${BAKE_WORKING_TAG}"]
  args = {
    APP_VERSION               = APP_VERSION
    FRONTEND_APP_VERSION      = APP_VERSION
    APP_FEATURE_FLAGS_JSON    = APP_FEATURE_FLAGS_JSON
    ENVIRONMENT               = ENVIRONMENT
    SENTRY_DSN                = SENTRY_DSN
    SENTRY_TRACES_SAMPLE_RATE = SENTRY_TRACES_SAMPLE_RATE
  }
}

target "frontend" {
  context    = "."
  dockerfile = "frontend/Dockerfile"
  tags       = ["eve-industry-planner-frontend:${BAKE_WORKING_TAG}"]
  args = {
    ENVIRONMENT               = ENVIRONMENT
    FRONTEND_APP_VERSION      = APP_VERSION
    SENTRY_ORG                = SENTRY_ORG
    SENTRY_PROJECT_ID         = SENTRY_PROJECT_ID
    SENTRY_DSN                = SENTRY_DSN
    SENTRY_AUTH_TOKEN         = SENTRY_AUTH_TOKEN
    SENTRY_TRACES_SAMPLE_RATE = SENTRY_TRACES_SAMPLE_RATE
    SENTRY_ERROR_SAMPLE_RATE  = SENTRY_ERROR_SAMPLE_RATE
  }
}
