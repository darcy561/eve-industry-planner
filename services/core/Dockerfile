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
    -o core-service ./core

FROM alpine:3.20

# Build argument for image source (for GitHub Container Registry linking)
ARG IMAGE_SOURCE=https://github.com/darcy561/eve-industry-planner

# wget: Swarm healthcheck probes :19100/ready
RUN apk --no-cache add ca-certificates tzdata wget && \
    addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

COPY --from=builder --chown=appuser:appuser /app/core-service /app/core-service

# Wrapper for triggering core task commands
COPY --chmod=0755 core/tasks.sh /usr/local/bin/tasks

# Label for GitHub Container Registry linking
LABEL org.opencontainers.image.source=${IMAGE_SOURCE}

# Same app-config env as API (metrics + parity with GET /api/v1/app-config); override at runtime via .env if needed.
ARG APP_VERSION
ARG FRONTEND_APP_VERSION
ARG APP_FEATURE_FLAGS_JSON="{}"
ENV APP_VERSION_NUMBER=${APP_VERSION}
ENV FRONTEND_APP_VERSION=${FRONTEND_APP_VERSION}
ENV APP_FEATURE_FLAGS_JSON=${APP_FEATURE_FLAGS_JSON}

USER appuser
ENTRYPOINT ["/app/core-service"]

