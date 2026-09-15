# syntax=docker/dockerfile:1.4
FROM golang:1.27.0-alpine AS builder

WORKDIR /app

COPY . .

ARG SENTRY_DSN=""
ARG ENVIRONMENT=production
ARG APP_VERSION

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -extldflags '-static' \
      -X eve-industry-planner/shared/telemetry.BakedSentryDSN=${SENTRY_DSN} \
      -X eve-industry-planner/shared/telemetry.BakedAppMode=${ENVIRONMENT} \
      -X eve-industry-planner/shared/telemetry.BakedRelease=${APP_VERSION} \
" \
    -trimpath \
    -o worker-service ./worker && \
    mkdir -p /app/worker && \
    printf '%s\n' "${APP_VERSION}" > /app/worker/VERSION

FROM alpine:3.20

# Build argument for image source (for GitHub Container Registry linking)
ARG IMAGE_SOURCE=https://github.com/darcy561/eve-industry-planner

# wget: Swarm healthcheck probes :19100/ready
RUN apk --no-cache add ca-certificates tzdata wget && \
    addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

COPY --from=builder --chown=appuser:appuser /app/worker-service /app/worker-service

# Plain-text build label for archive import normalization (see archiveimport.ResolveCanonicalBuildVer)
COPY --from=builder --chown=appuser:appuser /app/worker/VERSION /app/worker/VERSION

# Label for GitHub Container Registry linking
LABEL org.opencontainers.image.source=${IMAGE_SOURCE}

USER appuser
ENTRYPOINT ["/app/worker-service"]
