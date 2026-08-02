# Documentation rules

**Master documentation SoT for the whole `technical-documentation/` tree.** Default for every area unless a nearer `documentation-rules.md` says otherwise.

**Precedence:** a section’s own `documentation-rules.md` (e.g. `stack/documentation-rules.md`, `deployment/deployment-tool/documentation-rules.md`) **supersedes** this file on overlap for docs under that section. Where the section file is silent, this master still applies. Nested sections win over parents the same way (nearest wins).

Engineering / host ops / Go / Docker → [`technical-rules.md`](./technical-rules.md).

## Topic docs stay isolated (one hop)

Live topic docs (`stack/*.md`, `deployment/deployment-tool/**` topics, etc.) hold **only** what that topic owns. Cross-links are **one hop**: point at the next SoT, then stop.

| Do | Don’t |
|----|--------|
| Link once to the doc/file that owns the next concern | Chain the next topic’s steps (“edit YAML → `eip sync` → …”) here |
| Name the live default / change file (or package) | Re-teach another topic’s procedure, verb list, or ownership table |
| Owns / Does not own on section `contents.md` only | Owns tables or “does not own” inventories in topic docs |

Example: Traefik edge defaults → template `yamldefaults.DefaultConfig` / live `eip.config.yaml`. How sync applies that YAML lives in `config.md` / CLI docs — Traefik does not narrate it.

## Topic doc shape (live SoT)

Exemplar: [`stack/traefik.md`](./stack/traefik.md). Use the same discipline for other live topic docs (especially under `stack/`).

1. **Short intro** — what this SoT is and the primary code/YAML anchor.
2. **Image & defaults** (when the topic has pins / knobs) — table: Piece | Default | Change. Change stops at the owning file (`docker-stack*.yml`, template `yamldefaults.DefaultConfig`, live `eip.config.yaml`). No apply choreography.
3. **Topic wiring** — one clear diagram or table for how this piece fits (traffic, discovery, membership, …). Prefer naming networks/services as in YAML.
4. **Topic-only detail** — e.g. proxy allowlist; omit incomplete dumps of YAML that the Change column already points at.
5. **No** roadmap/migration links, Owns tables, smoke-curl sections, or re-teaching another doc’s procedure.

## `contents.md` shape

Each section `contents.md` is not a file listing. Use:

1. **Owns (SoT)** / **Does not own** — boundaries and where to link instead.
2. **Task map** — “I need to…” → doc rows.

Keep stub folders’ `contents.md` with empty task rows ready to expand. Do not use `contents.md` as a duplicate of the directory tree.

## Document current behaviour only

**Applies all the time** to live documentation (and the same bar for code comments — see [`technical-rules.md`](./technical-rules.md) § Current behaviour only): describe **what runs today**. Do not teach by naming retired practices, deleted scripts, old sentinels, or “never do X anymore” cutover notes.

| Do | Don’t |
|----|--------|
| State the current rule or behaviour | “Never do X anymore” cutover notes that name deleted tools |
| Point at the live SoT package / verb | List deleted paths or obsolete template strings as operator guidance |
| Put history in `migration-plans/` when needed | Keep migration checklists in `frontend/` / `backend/` / `stack/` / `deployment/` |

Rejecting leftover bad values in code is fine; **do not advertise those leftovers in docs**. Prefer “required keys must be set” over naming obsolete placeholders.

**Exception — migration writing only:** legacy / cutover language is allowed **only** when the work is explicitly a migration section (called out at the time — typically under `migration-plans/`). See [`migration-plans/documentation-rules.md`](./migration-plans/documentation-rules.md). That content is not live SoT until promoted.

## Migration plans are not SoT

`migration-plans/` documents migration process only. It is **not** live SoT until content is committed into live docs elsewhere. Folder rules (nearest wins): [`migration-plans/documentation-rules.md`](./migration-plans/documentation-rules.md).

## Development vs Deployment Tool CLI

`development/` is in-house documentation for building and working with project areas. Deployment Tool CLI verbs (examples: `eip dev`) are documented under `deployment/deployment-tool/cli/`; development docs may link there.

## Deployment Tool naming

- Product: **Deployment Tool** (CLI + TUI). Go module / repo folder: `deployment-tool/`.
- **`eip`** is the CLI binary prefix and command examples (`eip up`, `eip init`) — not the product name, owner, or “tool” label.
- Do not write “the eip tool”, “host eip”, or “eip only” as the operator surface; say **Deployment Tool** / **CLI** / **TUI**.

## Fragment / ship wording

- Stack membership: **data fragment** vs **app fragment** (and optional observability fragment).
- Day-2 app images: **`eip update`** / **`eip rebuild`**.

Detail → [`deployment/deployment-tool/cli/verbs.md`](./deployment/deployment-tool/cli/verbs.md). Fragments → [`stack/stack.md`](./stack/stack.md).

## Reference integrity

When a doc is moved, renamed, or split, recheck and correct all inbound references (markdown, README, scripts, Cursor rules, path strings).
