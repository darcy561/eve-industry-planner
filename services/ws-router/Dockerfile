# syntax=docker/dockerfile:1.4
FROM golang:1.26.5-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

COPY . .

# Binary must not be written into the ./ws-router source directory name.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    mkdir -p /out && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /out/ws-router ./ws-router

FROM alpine:3.20

ARG IMAGE_SOURCE=https://github.com/darcy561/eve-industry-planner

# wget: Swarm healthcheck probes :19100/ready
RUN apk --no-cache add ca-certificates tzdata wget && \
    addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

COPY --from=builder /out/ws-router /usr/local/bin/ws-router

LABEL org.opencontainers.image.source=${IMAGE_SOURCE}

EXPOSE 8080

# No Docker socket — discovery goes through stack ws-docker-proxy (allowlisted API).
USER appuser
ENTRYPOINT ["/usr/local/bin/ws-router"]
