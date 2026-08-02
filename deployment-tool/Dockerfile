# syntax=docker/dockerfile:1.4
# Eve Industry Planner deployment-tool module — builds the eip host binary
# (deployment-tool-windows / deployment-tool-linux) and a legacy oneshot image.
# Product path is HOST BINARY + TUI/CLI in one exe (command prefix: eip).
#
# Build context: ./admintool (see docker-bake.hcl)

FROM golang:1.26.5-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

COPY . .

ARG EIP_CLI_VERSION=0.0.0-dev

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -extldflags '-static' -X eve-industry-planner/deployment-tool/cmd/commands.Version=${EIP_CLI_VERSION}" \
    -trimpath \
    -o /out/eip .

FROM golang:1.26.5-alpine AS winbuilder

WORKDIR /app

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

COPY . .

ARG EIP_CLI_VERSION=0.0.0-dev

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build \
    -ldflags="-s -w -X eve-industry-planner/deployment-tool/cmd/commands.Version=${EIP_CLI_VERSION}" \
    -trimpath \
    -o /out/eip.exe .

FROM scratch AS host-windows
COPY --from=winbuilder /out/eip.exe /eip.exe

FROM scratch AS host-linux
COPY --from=builder /out/eip /eip

FROM docker:27-cli AS dockercli

FROM alpine:3.20

ARG IMAGE_SOURCE=https://github.com/darcy561/eve-industry-planner
ARG EIP_CLI_VERSION=0.0.0-dev

RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /out/eip /usr/local/bin/eip
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker

LABEL org.opencontainers.image.source=${IMAGE_SOURCE}
LABEL org.opencontainers.image.title=eve-industry-planner-deployment-tool
LABEL org.opencontainers.image.version=${EIP_CLI_VERSION}

WORKDIR /deploy
ENTRYPOINT ["eip"]
CMD ["help"]
