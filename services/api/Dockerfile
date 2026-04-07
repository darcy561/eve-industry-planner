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

# Sentry: same model as frontend (Dockerfile ARG → baked into binary). Empty/unset for local dev.
ARG SENTRY_DSN=""
ARG ENVIRONMENT=production
ARG APP_VERSION=development
ARG SENTRY_TRACES_SAMPLE_RATE=1.0

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
    -o api-service ./api

# Final stage - minimal Alpine image
FROM alpine:3.20

# Build arguments (only non-secret values)
ARG IMAGE_SOURCE=https://github.com/darcy561/eve-industry-planner
# FEEDBACK_DISCORD_WEBHOOK_URL: Optional Discord webhook URL for feedback notifications
# Defaults to empty string for local builds. Can be set via build arg or overridden at runtime via env var
ARG FEEDBACK_DISCORD_WEBHOOK_URL=""

# Install only essential packages (including su-exec for user switching and bash for exec -a)
RUN apk --no-cache add ca-certificates tzdata su-exec bash && \
    addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/api-service /app/api-service

# Copy entrypoint script
COPY api/entrypoint.sh /entrypoint.sh

# Create data directory and set permissions
RUN mkdir -p /data && \
    chmod +x /entrypoint.sh && \
    chown -R appuser:appuser /app

# Label for GitHub Container Registry linking
LABEL org.opencontainers.image.source=${IMAGE_SOURCE}

# Set environment variable from build arg (can be overridden at runtime via .env or docker-compose)
# If empty, feedback endpoint will skip Discord notifications (still returns success)
ENV FEEDBACK_DISCORD_WEBHOOK_URL=${FEEDBACK_DISCORD_WEBHOOK_URL}

EXPOSE 80

# Entrypoint runs as root to fix permissions, then switches to appuser
ENTRYPOINT ["/entrypoint.sh"]
