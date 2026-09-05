# Go 1.27 adoption

## Owns

Migration plan for taking the parts of the Go 1.27 release the repo can use, after the language-version move itself landed: `encoding/json/v2` adoption, simulated-time tests under `testing/synctest`, and the `go fix` sweep the new language version opened up. **Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote** (go-ahead).

## Does not own

- The language-version move itself — `go.mod` files and Dockerfile base images landed as ordinary work before this project opened. Recorded here as a prerequisite in [plan.md](./plan.md) § Prerequisite; not a track.
- Live core / changestream / scheduler behaviour → [backend/core/core.md](../../backend/core/core.md) (promote target)
- Live API request/response contracts → [backend/api/](../../backend/api/contents.md) (promote target for the wire question in Track A)
- Go engineering bar (modern idioms, `go fix` discipline) → [technical-rules.md](../../technical-rules.md) § Prefer modern Go
- Deployment Tool package layout / Docker wiring → [deployment-tool engineering.md](../../deployment/deployment-tool/cli/engineering.md); module rules → [deployment-tool technical-rules.md](../../deployment/deployment-tool/technical-rules.md)

## Task map

| I need to… | Read |
|------------|------|
| Goals, tracks, done-when, open decisions | [plan.md](./plan.md) |
| Measured v1 vs v2 JSON behaviour differences | [json-semantics.md](./json-semantics.md) |
| Landed behaviour notes (fill as work lands) | [overlay.md](./overlay.md) |
