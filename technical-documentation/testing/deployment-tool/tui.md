# TUI — tests

Live SoT for test depth under [`deployment-tool/tui`](../../../deployment-tool/tui). Behaviour → [tui/contents.md](../../deployment/deployment-tool/tui/contents.md). Module map → [contents.md](./contents.md).

## Entrypoints

```bash
# from deployment-tool/
go test ./tui/...
```

## Coverage map

**Depth:** Strong for home screen interactions, init wizard, builder session, and UI widgets. Entry `run.go`, logview, brand, and theme are largely untested.

### Tested

| Area | What the tests cover |
|------|----------------------|
| `screens/home` | Update/restart message parsing; resume/relaunch; CLI-done; progress overlay; mouse/keyboard nav (menu, more, command session, wheel); docs/secrets/settings builders; apply gating; cmdline; clipboard toggle |
| `screens/init` | Session view; builder first-create vs day-2; sections from registry; persist env/config/backup/AES roll/locked mongo; config persist preserving CLI |
| `builder` | Session lifecycle (nav/form, autogen, AES roll, locked fields, copy/paste, resize); mouse back/finish/nav/wheel; field zones; click-to-focus; nav keys |
| `ui` | Panel split/render/viewport; progress/marquee/zones; textinput styling/paste; cursor; list pagination; clipboard (Windows); progress fraction |
| `ops` / `exec` / `status` / `pane` / `output` | Menu order/gating/setup visibility; start/stop args; apply gate; CLI arg normalize; stdout demux/scan/wait; status bar render + event apply; output buffer; status text render |

### Thin

- Home `view` / `pickers` / `keys` / `nav` — mostly via interaction tests
- Builder `scroll`, `huh_theme`, `settle`, `focus_huh`
- `tui/status` poll/snapshot/statusmsg; `output/status` — one render test

### Little / none

- `tui/run.go` (entry)
- `screens/logview/`, `brand/`, `theme/`
- Root `tui/` package (if any non-test wiring)

## Topic-only detail

- Depth labels → [contents.md](./contents.md). Prefer `./tui/screens/home/` or `./tui/builder/` when iterating UX.
