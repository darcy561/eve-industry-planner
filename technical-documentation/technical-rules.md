# Technical rules

**Master technical SoT for the whole project** (Deployment Tool, `services/`, stack YAML, related docs). Area `technical-rules.md` files may add local notes; on overlap for work in that area, the **nearest** section file **supersedes** this one (same precedence idea as [`documentation-rules.md`](./documentation-rules.md)).

Docs shape / naming / one-hop → [`documentation-rules.md`](./documentation-rules.md). Migration process docs → [`migration-plans/documentation-rules.md`](./migration-plans/documentation-rules.md). Deployment Tool package map → [`deployment/deployment-tool/cli/engineering.md`](./deployment/deployment-tool/cli/engineering.md).

## Current behaviour only (code, comments, and docs)

**Applies all the time** to code, comments, commit messages, UI copy, and live documentation: describe **what runs today**. Do not teach by naming retired practices, deleted scripts, old sentinels, or “never do X anymore” cutover notes.

| Do | Don’t |
|----|--------|
| State the current rule or behaviour | Cutover notes that name deleted tools or paths |
| Point at the live SoT package / verb / YAML | Advertise obsolete placeholders as operator or implementer guidance |
| Put migration history in `migration-plans/` | Keep migration checklists in live docs or sprinkle legacy names in comments “for context” |
| Comment what the code/package owns today | Cite migration tickets, overlay numbers, roadmap sections, or “from #N” in product code comments |

Rejecting leftover bad values in code is fine; **do not document or comment those leftovers** as guidance. Prefer “required keys must be set.”

**Exception — migration writing only:** legacy / cutover / before-after language is allowed **only** when you are explicitly working in a **migration** context that is called out at the time (e.g. editing `migration-plans/`, or a task that says this slice is migration documentation). That writing stays in migration-plans until promoted; it does not become the default for normal code or live SoT. Folder rules: [`migration-plans/documentation-rules.md`](./migration-plans/documentation-rules.md).

Same bar for live docs: [`documentation-rules.md`](./documentation-rules.md) § Document current behaviour only.

## Comments earn their place

**Applies all the time, to every language in the repo.** A comment is for what a reader cannot get
from the code. Sparse is the house style: a file where the prose outweighs the statements is harder
to read, not easier, and it goes stale in ways the code does not.

| Comment this | Not this |
|--------------|----------|
| An invariant or rule the code cannot show: "both bounds travel together, the API rejects half a range" | A restatement of the next line, or narration of control flow |
| A *why* that stops a plausible-looking change: "no cache options here — the layer below keys its own cache by version" | The design discussion behind the choice; that belongs in the plan or overlay |
| A trap that has already cost something: a field that must be unset rather than omitted | A JSDoc block on an obvious local helper, or `@param` for self-describing arguments |
| What a package or exported surface owns | Anything the name already says |

Two habits that keep this honest:

- **Write the code first, then decide what still needs saying.** Most comments drafted alongside the
  code are explaining a decision the reader does not need to relive.
- **Re-read a file whole after several edits.** Comments accumulate one reasonable line at a time,
  and the bloat is only visible in aggregate.

Naming is the first tool: a function or field named for what it holds needs less comment than one
that needs a paragraph to excuse its name. Comment content also follows § Current behaviour only.

## Host ops (Deployment Tool)

Operator surface is the **Deployment Tool** (CLI + TUI). Binary prefix **`eip`** / `eip.exe` — command examples only, not the product name.

| Need | Use |
|------|-----|
| Bring up / recover | **`eip up`** (live) / **`eip dev`** (bake) |
| Day-2 YAML / secrets | **`eip sync`** / **`eip secrets`** |
| Local image roll | **`eip rebuild`** |
| Host tool / stacks / images | **`eip update`** (`--binary-only` / `--stacks-only` / `--images-only`) |
| Data plane ensure | Ready on up/dev; or **`eip ensure-s3`** / **`eip ensure-mongo`** |
| Logs / core tasks / stop | **`eip logs`** / **`eip cli`** / **`eip shutdown`** |
| Build host binary | **`scripts/deployment-tool/build-host.*`** → repo-root `eip` / `eip.exe` |

Verb behaviour → [`deployment/deployment-tool/cli/verbs.md`](./deployment/deployment-tool/cli/verbs.md). Bring-up → [`deploy.md`](./deployment/deployment-tool/cli/deploy.md). Task map → [`cli/contents.md`](./deployment/deployment-tool/cli/contents.md).

Operator verbs stay in `deployment-tool/internal/catalogue` and the TUI menu — do not invent parallel ship/release host commands.

Day-2 app images: **`eip update`** (GHCR pull + digest-reconcile) or **`eip rebuild`** (local bake) for the **app fragment**. Fragments → [`stack/stack.md`](./stack/stack.md).

Bring-up (`up`/`dev`) creates the world; day-2 (`sync`/`secrets`/`rebuild`/`update`) mutates it — do not teach full bring-up as the config hammer.

## Engineering practices — shared (all areas)

**Shared bar** for structuring work, dependencies, safety, and tests across the repo. Language-specific detail is under **Go / backend** below. Frontend SPA rules are not filled yet → [`frontend/technical-rules.md`](./frontend/technical-rules.md). Backend area pointer → [`backend/technical-rules.md`](./backend/technical-rules.md). Nearest area `technical-rules.md` supersedes on overlap.

### Choices — explain options

When there is more than one reasonable approach (library, API shape, layout, SDK vs CLI, etc.): **explain the options and pros/cons** in **planning before writing**, or immediately after writing if the choice appeared mid-implementation — then pick one. Do not silently pick a legacy pattern when a modern one exists without saying why.

### Dependencies — stay current

- Before implementing anything that **adds or relies on** a third-party package: check its **current version**, release notes, and whether it is **deprecated** or unmaintained. Prefer the latest suitable release; do not start new work on a known-dead stack.
- Bring modules/packages **up to date as we work through an area** so debt does not pile into rare mega-upgrades.
- Flag security-sensitive or API-breaking upgrades before merging if they need a coordinated cut.

### Package / module layout and refactors

- New code should be **reusable later**: shared behaviour in helpers/packages, not one-off copies inside a screen or role.
- **Extend existing shared packages** instead of inventing parallel helpers (logging, telemetry, HTTP/WS plumbing, auth helpers, etc.). If the shared package is missing a capability, add it there — do not create a one-off function beside a call site.
- Keep packages **organised in sensible subfolders** with clear names. If a name might clash with an existing package or confuse ownership, **flag it before going further**.
- **Do not** create deep trees of subfolders that each hold a single tiny file. If a refactor starts looking like that, **stop**, regroup (fewer packages / flatter layout), then continue.
- When refactoring a section: **fully move callers** to the new shape. **Do not leave legacy wrappers** that only forward to the old location “for compatibility” inside the same codebase — finish the cutover in that change (or an immediate follow-up in the same effort).

### One SoT for shared facts (frontend and backend)

Applies to **SPA / frontend**, Go services, and Deployment Tool alike — not a backend-only idea.

- Do **not** scatter hard-coded lists, magic strings, duplicated membership tables, or parallel “convenient” copies of the same facts across packages, UI, and docs.
- There should be **one source of truth**; other places **gather or build dynamically** from that SoT (or a thin derived view), not re-type the list.
- Examples of SoT homes (not exhaustive):
  - Operator secrets / `.env` schema → `EnvFields` (Deployment Tool)
  - Capacity/addons/tunables → `yamldefaults.DefaultConfig` / `ConfigFields`
  - Stack membership → fragment YAML
  - Expected Swarm services → catalogue / stack discovery as appropriate
  - Frontend public runtime knobs → stack/`x-frontend-public-env` (and the owning template/emit path) — not a second hand-maintained list in the SPA
  - Product strings / theme tokens / menu catalogs → their existing single owners (kit, theme, ops) — do not fork copies into screens

### Prefer modern platform idioms (every stack)

- Prefer **current** language/framework idioms over legacy patterns in the stack you are editing (Go, and later SPA/TS when that bar is filled in).
- **Go:** verify with **`go fix`** — see **Prefer modern Go** below.
- **Frontend:** use modern React / JavaScript practices consistent with the repo as they are documented; do not introduce parallel old patterns “because the SPA bar is unfinished.” Shared rules here (SoT, reuse, deps, testing-as-we-build, security for client bundles) **already apply**.
- SPA-specific design-system / UI rules will live in [`frontend/technical-rules.md`](./frontend/technical-rules.md) when written; until then, do not invent a second global frontend standard in chat — extend that file.

### Concurrency and cancellation

- Work that can block, wait on I/O, or run in the background must be **cancellable**: pass and honour `context.Context` (or the platform equivalent) through the call chain.
- Do not leak goroutines / background tasks: every started async path has a clear owner and shutdown/cancel path.
- Long-running operator/CLI work must respect process signals (see Go / backend for Deployment Tool helpers).

### Shared output & observability (industry-standard shapes)

Cross-cuts the reusable-helpers rule: **do not invent unique logging, metrics, or request/response styles per feature.**

- **Use the existing shared observability / logging / metrics packages** for the area you are in (backend, frontend, Deployment Tool, etc.). Do not stand up a parallel logger, metrics client, or ad-hoc print path beside a call site.
- Soft-fail when optional collectors/backends are unset so core behaviour still runs.
- **Never log secrets** (tokens, passwords, private keys, full credential dumps). Redact or omit.
- Prefer **industry-standard shapes** for how we emit and describe traffic, not bespoke one-off formats scattered through the codebase:
  - **HTTP / API** — conventional status codes, error bodies, and middleware/request logging consistent with existing patterns in that service (correlation ids / trace context via the shared path).
  - **Logs** — structured fields through the shared logging API, not ad-hoc string assembly or a second logging stack.
  - **WebSocket** — requests, responses, and messages follow the existing protocol and shared logging/metrics helpers; do not invent parallel message envelopes or log line styles per handler.
- **Add our own sections only when needed** — domain-specific fields, event names, or metrics belonging to a feature — but still **through** the shared APIs and naming conventions, not a new mini-framework beside them.
- If a standard shape is missing in shared code, **extend that shared package** (and document it) rather than forking a unique style in one place.

### API / wire compatibility — flag in planning

- **In planning** (before implementation): call out whether the change is **additive**, **breaking**, or **migrate-required** for any public or cross-process surface: HTTP/API contracts, EIPMSG / child-CLI protocol, operator env keys, Swarm labels, cookies, or persisted document shapes.
- Prefer additive changes. Breaking changes need an explicit migrate/compat plan in the same planning note — do not discover them only at review.

### Security defaults

- Secrets stay in the secrets path (`.env` / Swarm secrets / `/run/secrets`); never hard-code credentials or ship them in images, client bundles, or examples.
- New Docker/network allowlists and socket-proxy permissions stay **least privilege**; do not widen an existing proxy “for convenience” across trust boundaries.
- Do not put privileged Engine access on app containers (see Go / backend Docker rules).

### Performance — call out at implementation

Modern-idiom, clarity, and reuse rules **win by default**. Micro-optimisations and “hot path” shortcuts often **fight** those rules.

- **At implementation time**, highlight when you are choosing a less-clear or less-reusable shape **for performance**, with a short why (measured or strongly evidenced — not guessed).
- Do not micro-optimise by default; do not silently violate helpers / SoT / modern-idiom guidance for speed without that call-out.

### Testing as we build

- Add tests **with new features**, not as a later cleanup wave when avoidable.
- Prefer **unit tests** plus a **per-service (or per-area) shared test helper library** (fakes, fixtures, harnesses) so coverage grows coherently.
- Eventual goal: **end-to-end** testing on top of that base.
- Broader testing area → [`testing/`](./testing/contents.md) as it fills in.

### Error handling (open)

Exact wrap / sentinel / operator-facing error practices are **not locked** yet. Follow patterns already used in the package you are editing; propose a shared bar when we have enough examples to standardise.

---

## Engineering practices — Go / backend & Deployment Tool

Applies to `services/**` (Go) and `deployment-tool/**`. Complements the shared section above. Package map / Docker client naming → [`deployment/deployment-tool/cli/engineering.md`](./deployment/deployment-tool/cli/engineering.md).

### Prefer modern Go (and say when you don’t)

- Prefer **newer stdlib / idioms over older** when both work: `slices` / `maps` / `cmp` over hand-rolled loops where they fit; `errors.Is` / `errors.As` / `errors.AsType` over stringly or bare `==`; `strings.Cut` / `SplitSeq` / `CutPrefix` over older split+index patterns; `any` over `interface{}`; no pre-1.22 `e := e` loop captures; `errgroup` for parallel work that returns errors.
- **`go fix` on written code only:** after writing or editing Go in `services/**` or `deployment-tool/**`, run **`go fix -diff`** scoped to the **packages (or files) you actually touched** in that change — not the whole module, sibling packages, or unrelated paths in the same folder tree. Empty diff on that scope = modern enough for the default fixers; non-empty = apply fixes **only in that same scope** (or `go fix` on those packages then review). Do **not** use the check as a reason to modernize untouched code in the same PR. Do not skip this check on new or changed code.
- Long-running CLI/ops: **signal-aware contexts** (`process.TimeoutSignalContext` / `SignalContext` + `MapDoneError`) — not bare `context.WithTimeout(context.Background(), …)` for operator verbs.
- `go.mod` / `tools/go.mod`: **language version only**. **Never** add a `toolchain` directive.
- Modules are **not all on the latest Go yet** — bump the module `go` version **as we touch that area** (incremental upgrade), not a big-bang rewrite of everything at once.
- Skip experimental / no-fit APIs. Keep Moby / compose-go / Cobra / NATS / Redis client shapes as used in-tree unless a deliberate upgrade is planned.

### Docker — Moby first (Deployment Tool)

- Engine/Swarm work uses the **Moby Go SDK** as much as possible (`internal/docker.NewAPIClient` → handle name `apiClient`, never `cli`).
- **docker CLI** (shell-out) is **emergency only**. Existing rare cases: stack deploy, buildx bake. **Any new CLI or raw Engine HTTP path must be flagged before implementing.**
- **No Docker socket on app containers.** Per-consumer socket proxies on their own overlays; never share docker nets or widen allowlists across trust boundaries.
- Capacity-controller work: policy Evaluate stays pure; Docker mutations only behind cluster/executor; dry-run / fake path before armed Apply.

### Go testing notes

- Deployment Tool test layout → [`deployment/deployment-tool/cli/testing.md`](./deployment/deployment-tool/cli/testing.md).
- Do not ship armed Swarm mutations without a dry-run or fake path first.
