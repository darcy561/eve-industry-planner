# syntax=docker/dockerfile:1.4
FROM golang:1.27.0-alpine AS builder

WORKDIR /app

COPY . .

ARG SENTRY_DSN=""
ARG ENVIRONMENT=production
ARG APP_VERSION
# Optional: omit or set at build time; runtime SENTRY_TRACES_SAMPLE_RATE in .env overrides when non-empty.
ARG SENTRY_TRACES_SAMPLE_RATE=

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -extldflags '-static' \
      -X eve-industry-planner/shared/telemetry.BakedSentryDSN=${SENTRY_DSN} \
      -X eve-industry-planner/shared/telemetry.BakedAppMode=${ENVIRONMENT} \
      -X eve-industry-planner/shared/telemetry.BakedRelease=${APP_VERSION} \
      -X eve-industry-planner/shared/telemetry.BakedSentryTracesSampleRate=${SENTRY_TRACES_SAMPLE_RATE}" \
    -trimpath \
    -o worker-service ./worker && \
    mkdir -p /app/worker && \
    printf '%s\n' "${APP_VERSION}" > /app/worker/VERSION

FROM alpine:3.20

# Build argument for image source (for GitHub Container Registry linking)
ARG IMAGE_SOURCE=https://github.com/darcy561/eve-industry-planner

# wget: Swarm healthcheck probes :19100/ready
RUN apk --no-cache add ca-certificates tzdata su-exec bash wget && \
    addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

COPY --from=builder /app/worker-service /app/worker-service

# Plain-text build label for archive import normalization (see archiveimport.ResolveCanonicalBuildVer)
COPY --from=builder /app/worker/VERSION /app/worker/VERSION

COPY worker/entrypoint.sh /entrypoint.sh

RUN mkdir -p /data && \
    chmod +x /entrypoint.sh && \
    chown -R appuser:appuser /app

# Label for GitHub Container Registry linking
LABEL org.opencontainers.image.source=${IMAGE_SOURCE}

# Entrypoint runs as root to fix permissions, then switches to appuser
ENTRYPOINT ["/entrypoint.sh"]
