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
    -o websocket-service ./websocket

# Final stage - minimal Alpine image
FROM alpine:3.20

# Build arguments (only non-secret values)
ARG IMAGE_SOURCE=https://github.com/darcy561/eve-industry-planner

RUN apk --no-cache add ca-certificates tzdata su-exec bash && \
    addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/websocket-service /app/websocket-service

# Copy entrypoint script
COPY websocket/entrypoint.sh /entrypoint.sh

RUN mkdir -p /data && \
    chmod +x /entrypoint.sh && \
    chown -R appuser:appuser /app

LABEL org.opencontainers.image.source=${IMAGE_SOURCE}

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]

