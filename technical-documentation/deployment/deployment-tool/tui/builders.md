# Deployment Tool — TUI builders

Setup / Secrets / Settings flows. Packages: `tui/builder`, `tui/screens/init`, Persist helpers in `screens/home/docs.go`. Field registries → [variables.md](../cli/variables.md).

Builders expose **[ ← Back ]** (form → sections; sections → leave) beside Finish. Keys → [input.md](./input.md).

## Setup

Shown when `.env`, `eip.config.yaml`, or `docker-stack*.yml` is missing (`ops.SetupNeeded`).

1. Env panels (incl. `cli.env_backup_path`) → PersistEnv.
2. **Use defaults** or **Advanced** (config panels from `ConfigFields`).
3. Does **not** start the stack.
4. Esc on the choice skips further Setup (env already saved).

Headless file generation (no guided UI) is `eip init` via Command / CLI — [verbs.md](../cli/verbs.md).

## Secrets / Settings (day-2)

- Right pane: `charm.land/huh/v2` with force-dark styles from `tui/theme` / builder huh theme.
- Left: section nav unchanged.
- **Finish** (tab past last field / click / **ctrl+s**) → Persist.
- If Health up and Docker green → child apply (`eip secrets` then `eip sync`, or `eip sync` only). Otherwise operator uses Start/Dev or Command. Verb behaviour → [verbs.md](../cli/verbs.md).
- **Autogen** checkbox only on first create (field still unset).
- Day-2 **Roll** for S3 / AES. AES Roll updates version / legacy key material (registry SoT → [variables.md](../cli/variables.md); not TUI fields).
- Locked values show as disabled inputs.
- ↑↓ stay in the active pane (sections **or** fields). Click a form field to focus it; wheel scrolls the form viewport.
