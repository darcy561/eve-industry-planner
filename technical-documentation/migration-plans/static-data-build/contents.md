# Static data build

## Owns

Whether an SDE build is worth running at all, and what one costs when it runs: the version check
against CCP's published endpoints, the gate that decides a build is irrelevant before anything is
downloaded, how much of the archive is fetched, and the observability that makes a skipped run
distinguishable from a broken one.

- **The version check** — reading `latest.jsonl` as the JSON Lines it is, and never falling back to a
  download URL that names a different build than the one just checked.
- **The relevance gate** — CCP's per-build `changes/<build>.jsonl` feed, chained through
  `lastBuildNumber`, matched against the datasets the conversion reads, as `requiredFiles` lists
  them (see [plan.md](./plan.md) § Stage B).
- **Schema drift** — the `schemaChanged` flag the same feed carries, against an allowlist that fails
  silently when a field is renamed.
- **What is downloaded** — the 99 MB archive of which 27 MB is read, and the in-memory budget the
  current shape is built around.
- **Run observability** — a counter that says why a run did nothing, so a wrongly skipped build is
  not invisible.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan stages done + live-SoT **promote**
(go-ahead).

## Does not own

- **The published layout** — object keys, the version manifest, atomicity of the publish, and the
  retention of previous builds → [../static-data-delivery/contents.md](../static-data-delivery/contents.md)
- **What the converted files contain.** The conversion's output shapes are this project's input; it
  changes when they are produced, not what is in them.
- **How a file reaches the browser** → [../static-data-delivery/contents.md](../static-data-delivery/contents.md)
- **The Mongo blueprints collection's own shape** → live `backend/`.
- **The scheduler** itself; this project changes what the task does when it fires, not when it fires.

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when, open questions | [plan.md](./plan.md) |
| Know what is additive, breaking, or migrate-required | [plan.md](./plan.md) § Wire compatibility |
| See how often our datasets actually change, and which output each one feeds | [measurements/changes-feed.md](./measurements/changes-feed.md) |
| Argue about whether a build can be skipped before repeating an assumption | [measurements/changes-feed.md](./measurements/changes-feed.md) § What a build costs today |
| See how much of CCP's archive the conversion actually reads | [measurements/archive.md](./measurements/archive.md) |
| Know whether ranged fetching of the archive is viable | [measurements/archive.md](./measurements/archive.md) § What the endpoint supports |
| Read how the build path behaves after a landed slice | [overlay.md](./overlay.md) |
| Check what has really landed, what each remaining step changes, and what needs a decision | [review.md](./review.md) |
