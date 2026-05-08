# syntax=docker/dockerfile:1.4
FROM golang:1.26.1-alpine AS builder

WORKDIR /app

# Copy module files first for better layer caching
COPY go.mod go.sum ./

# Download dependencies with BuildKit cache mount for faster builds
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

# Copy source code
COPY . .

ARG SENTRY_DSN=""
ARG ENVIRONMENT=production
ARG APP_VERSION
# Optional: omit or set at build time; runtime SENTRY_TRACES_SAMPLE_RATE in .env overrides when non-empty.
ARG SENTRY_TRACES_SAMPLE_RATE=

# Build the application with optimizations
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -extldflags '-static' \
      -X eve-industry-planner/shared/telemetry.BakedSentryDSN=${SENTRY_DSN} \
      -X eve-industry-planner/shared/telemetry.BakedAppMode=${ENVIRONMENT} \
      -X eve-industry-planner/shared/telemetry.BakedRelease=${APP_VERSION} \
      -X eve-industry-planner/shared/telemetry.BakedSentryTracesSampleRate=${SENTRY_TRACES_SAMPLE_RATE}" \
    -trimpath \
    -o core-service ./core

# Final stage - minimal Alpine image
FROM alpine:3.20

# Build argument for image source (for GitHub Container Registry linking)
ARG IMAGE_SOURCE=https://github.com/darcy561/eve-industry-planner

# Install only essential packages (including su-exec for user switching and bash for exec -a)
RUN apk --no-cache add ca-certificates tzdata su-exec bash && \
    addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/core-service /app/core-service

# Copy entrypoint script
COPY core/entrypoint.sh /entrypoint.sh

# Wrapper for triggering core task commands
COPY core/tasks.sh /usr/local/bin/tasks

# Create data directory and set permissions
RUN mkdir -p /data && \
    chmod +x /entrypoint.sh && \
    chmod +x /usr/local/bin/tasks && \
    chown -R appuser:appuser /app

# Label for GitHub Container Registry linking
LABEL org.opencontainers.image.source=${IMAGE_SOURCE}

# Same app-config env as API (metrics + parity with GET /api/v1/app-config); override at runtime via .env if needed.
ARG APP_VERSION
ARG FRONTEND_APP_VERSION
ARG APP_FEATURE_FLAGS_JSON="{}"
ENV APP_VERSION_NUMBER=${APP_VERSION}
ENV FRONTEND_APP_VERSION=${FRONTEND_APP_VERSION}
ENV APP_FEATURE_FLAGS_JSON=${APP_FEATURE_FLAGS_JSON}

# Entrypoint runs as root to fix permissions, then switches to appuser
ENTRYPOINT ["/entrypoint.sh"]

