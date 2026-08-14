# Testing overview

Live SoT for the cross-cutting test-layer map. Module roots: `services/go.mod`, `deployment-tool/go.mod`, `frontend/` (Vitest). Area detail is one hop.

## Entrypoints

| Check | Where | Notes |
|-------|--------|--------|
| Services unit | From `services/`: `go test ./…` | No Docker — [services/contents.md](./services/contents.md) |
| Frontend unit | From `frontend/`: `npm test` / `npm test -- --run` | Vitest — [frontend/contents.md](./frontend/contents.md) (placeholder) |
| Deployment Tool unit | From `deployment-tool/`: `go test ./…` | No Docker — [CLI testing](../deployment/deployment-tool/cli/testing.md); depth → [deployment-tool/contents.md](./deployment-tool/contents.md) |
| Deployment Tool Swarm integration | `go test ./internal/swarm/ -tags=integration` | Needs Docker + Swarm — same CLI testing doc |
| **CI test suite** | [`.github/workflows/test.yml`](../../.github/workflows/test.yml) | Path-filtered jobs for services / frontend / deployment-tool; see below |
| Manual stack soak | Local Swarm + Deployment Tool verbs | [guide.md](../deployment/guide.md), [verbs.md](../deployment/deployment-tool/cli/verbs.md); `eip doctor` |

## CI test suite

One workflow covers the full automated unit/integration surface. Suites run only when their trees change (or when the workflow file itself changes). New tests under those trees are included automatically (`go test ./…` / Vitest discovery).

| Suite | Paths that select it | Job |
|-------|----------------------|-----|
| Services | `services/**` | `go test ./…` (Ubuntu) |
| Frontend | `frontend/**` | `npm ci` + `npm test -- --run` (Ubuntu, Node 24; `APP_VERSION=0.0.0-ci` — root `.env` is gitignored) |
| Deployment Tool | `deployment-tool/**`, `scripts/deployment-tool/**` | unit `go test ./…` + build; Swarm `integration` tag (Ubuntu) |

| When | Behaviour |
|------|-----------|
| Push / PR → **`Public`** or **`Development`** | Auto; only selected suites; aggregate check **`ci`** must be green |
| Other branches | **Manual only** — Actions → **test** → Run workflow (toggle suites) |
| Public app / CLI ship | Manual dispatch still; **blocked** until tip has a successful `test.yml` run ([`require-test-green.sh`](../../.github/scripts/require-test-green.sh)). CLI ship then re-runs Ubuntu unit + Swarm before upload |

### Branch protection (repo settings)

GitHub cannot set rulesets from this markdown alone. For **`Public`** and **`Development`**, require status check **`ci`** (job in `test.yml`) on PRs / before merge. That check is always reported: selected suites must succeed; skipped suites (path filter) are OK.

Ship workflows do **not** auto-publish; they still need **Run workflow**, but fail fast if tip CI is missing/red.

## Coverage map

| Layer | What | Owning testing SoT |
|-------|------|---------------------|
| Services unit | Per-service test depth (tested / thin / little) | [services/contents.md](./services/contents.md) |
| Deployment Tool unit | Diffs, YAML, kit, TUI; Engine via `enginetest` | [deployment-tool/contents.md](./deployment-tool/contents.md) + [CLI testing](../deployment/deployment-tool/cli/testing.md) |
| Deployment Tool Swarm integration | Secret/config ensure + prune on a real Engine | [swarm.md](./deployment-tool/swarm.md) |
| Frontend unit | SPA Vitest suites | [frontend/contents.md](./frontend/contents.md) (placeholder — depth topics TBD) |
| Manual stack soak | Bring-up and day-2 against a live stack | guide + verbs (above); topology → [stack/contents.md](../stack/contents.md) |
| Shared Go harness / ops soak | Packages under `services/testing/` | [harness.md](./harness.md) |

## Topic-only detail

- Default unit suites do **not** require Docker. Swarm integration and soak do.
- CI entry → [`.github/workflows/test.yml`](../../.github/workflows/test.yml).
- Deployment Tool conventions → [engineering.md](../deployment/deployment-tool/cli/engineering.md).
