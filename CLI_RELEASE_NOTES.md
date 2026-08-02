# CLI release notes (pending)

> **Replace this example before tagging `cli-v*`.** CI strips the `#` title above and uses the rest as the GitHub Release body for both the pin (`cli-vX.Y.Z`) and the floating `cli` tag.

## Highlights

- Short summary of what changed in the Deployment Tool CLI binary
- Call out anything that changes bootstrap / `eip update` / TUI Setup

## Changes

- **Added** — new verbs, flags, or TUI flows
- **Fixed** — host-tool bugs
- **Changed** — defaults or baked channel behaviour

## Install / update

```bash
# Fresh host (binary only; then init for stacks + docs)
curl -fsSL …/eip-bootstrap.sh | bash -s -- ~/eip
./eip init
./eip up

# Existing host
eip update                 # stacks (if changed) + binary
eip update --binary-only
```

## Assets

| Platform | Asset |
|----------|--------|
| Windows amd64 | `eip-windows-amd64.exe` |
| Linux amd64 | `eip-linux-amd64` |
| macOS amd64 / arm64 | `eip-darwin-amd64` / `eip-darwin-arm64` |
| Checksums | `SHA256SUMS` |
