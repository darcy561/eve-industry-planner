# eip — TUI ↔ CLI messaging

How the desktop TUI and child `eip` verbs talk. Read this if “why parse stdout?” or “why not a Go channel?” is unclear.

Related: [TUI.md](./TUI.md) (UX / hard rules), [ENGINEERING.md](./ENGINEERING.md) (package map).

---

## The one-sentence model

**Ops run in a child process. Bubble Tea messages only exist inside the TUI process. The child sends JSON lines on stdout (`EIPMSG`); stderr is real errors for the OUTPUT pane. The parent turns both into `tea.Msg`.**

---

## Why two processes?

The TUI does **not** call Cobra or Docker in-process. Every menu action runs:

```text
eip.exe <verb> …     with env EIP_FROM_TUI=1
```

Reasons (locked for this tool):

| Reason | What it buys |
|--------|----------------|
| Same binary | Shell `eip status` and TUI **Status** share one verb implementation |
| Windows console | Avoid Docker/Cobra console-lifetime issues inside the Bubble Tea process |
| Isolation | A crashing verb does not take down the TUI |
| Boundary | TUI = UI; child = ops + Moby Engine SDK |

Cost: parent and child **do not share memory**. Go `chan` values cannot cross that boundary.

---

## Go channels vs process IPC

| Mechanism | Scope |
|-----------|--------|
| `chan T` / `tea.Msg` | **Same process** — goroutines inside the TUI (or inside the child) |
| Pipes, sockets, stdout/stderr lines | **Separate processes** — real IPC |

So:

- TUI home ↔ `tui/exec` stream goroutines → channels / `tea.Msg` (same process). ✅
- TUI parent ↔ child `eip.exe` → must send **bytes** on an OS stream. ✅ wire protocol below

A `chan` created in the child is invisible to the parent. That is normal Go, not a missing feature.

---

## The wire (EIPMSG)

Under TUI, the child writes **one JSON envelope per line** on **stdout**:

```text
EIPMSG {"version":1,"type":"pane.status","data":{…}}
```

| Stream | Role |
|--------|------|
| **stdout** | Protocol only (`EIPMSG ` + envelope). Non-protocol lines discarded under TUI. |
| **stderr** | Human error text → OUTPUT pane (append as-is). |

Standalone CLI (no `EIP_FROM_TUI`) still uses stdout for human dumps (e.g. `status.FormatPlain`). `Emit*` helpers are no-ops when the flag is unset.

```text
Child (eip status)                         Parent (TUI)
─────────────────                         ────────────
Build report
msg.EmitStatus(report)
  → stdout: EIPMSG {"version":1,"type":"pane.status","data":{…}}
msg.EmitStack(…)
  → stdout: EIPMSG {"version":1,"type":"chip.stack","data":{…}}

                                          tui/exec reads stdout line-by-line
                                          msg.ParseLine → tea.Msg
                                          home.Update → pane.Buffer / chips

errors → stderr                          → pane.AppendMsg
```

Always emit via helpers — do not hand-build lines.

---

## Envelope

```json
{"version":1,"type":"<message-type>","data":{…}}
```

- **version** — protocol version (`1` today). Unknown versions are rejected.
- **type** — stable string (see below). Chip `Event.Kind` is this same string after decode.
- **data** — type-specific JSON object.

---

## Message types

| Type | Helper | Parent `tea.Msg` | Purpose |
|------|--------|------------------|---------|
| `pane.text` | `msg.EmitText` / `Step` / `Line` | `pane.AppendMsg` | Append string as-is (`Step`/`Line` for up/dev; bake/docker verbose via `LineWriter`) |
| `pane.status` | `msg.EmitStatus(report)` | `output/status.Msg` | `output/status.Render` (lipgloss) then append |
| `chip.docker` | `msg.EmitDockerFromSwarm` / `Emit` | `exec.EventMsg` | Docker chip + menu gate |
| `chip.health` | `msg.EmitHealthFromProbe` | `exec.EventMsg` | Health chip |
| `chip.app` | `msg.EmitAppVersion` | `exec.EventMsg` | Header deployed `APP_VERSION` |
| `chip.stack` | `msg.EmitStack` / `EmitStackForVerb` | `exec.EventMsg` | StatusMsg bar text (user verbs only) |

Probe / `eip doctor` under TUI must emit **chip.docker + chip.health + chip.app** only — never pane types or `chip.stack` (background refresh must not spam the OUTPUT pane).

Never put OUTPUT body text in chip messages.

---

## Inside the TUI (after decode)

```text
exec.Stream.Msgs  (chan tea.Msg)
        │
        ▼
home.Update
  ├─ exec.EventMsg      → status.ApplyEvent → Snapshot chips
  ├─ pane.AppendMsg       → Buffer.Append(text)   // pane.text or stderr
  ├─ output/status.Msg    → Buffer.Append(status.Render(report))
  └─ exec.DoneMsg         → command finished (history kept; no wipe)
        │
        ▼
pane.Buffer  (append-only scrollback)
```

Local UI can also append without a child: `pane.AppendMsg{Text: "…"}` from any screen.

---

## Standalone CLI vs TUI child

Example: **status**

| Mode | Human output | Machine protocol |
|------|--------------|------------------|
| CLI (`eip status`) | `FormatPlain` → **stdout** | none |
| TUI child | none (human dump skipped) | `pane.status` + optional `chip.stack` on stdout |

Implemented verbs (`up`, `dev`, `status`, …) emit `pane.text` / `pane.status` under TUI; failures go to **stderr** (pane). Stubs still error on stderr + `msg.EmitStackForVerb` for the StatusMsg bar.

Gate CLI vs TUI with `msg.Enabled()` (same as `process.FromTUI()`).

---

## What we are *not* doing

| Idea | Why not (for now) |
|------|-------------------|
| Go `chan` from child to parent | Different processes — channels do not cross |
| In-process Cobra from TUI | Breaks child-process rule / Windows console policy |
| Protocol on stderr / dual prefixes | One `EIPMSG` envelope on stdout; stderr is errors only |
| Scraping human CLI text for chips | Probe must emit chip EIPMSG; missing events → unreachable |
| Putting pane payloads in chip types | Keep chip bar and OUTPUT pane as separate traffic |

---

## Code map

| Piece | Role |
|-------|------|
| `internal/process` | `EIP_FROM_TUI` / `FromTUI` / `ChildEnv` |
| `internal/msg` | Envelope, `EmitText` / `EmitStatus` / `Line` / `Step`, chip `Emit`/`Emit*`, `ParseLine` |
| `internal/status` | `Build` report; `WriteReport` walk; `FormatPlain` (CLI); outfmt geometry |
| `tui/exec` | Spawn child; demux stdout EIPMSG + stderr → `tea.Msg` |
| `tui/pane` | `Buffer`, `AppendMsg` (scrollback only) |
| `tui/output/<verb>` | Per-command styled writers on `WriteReport` (`status.Render`, …) |
| `tui/screens/home` | `Update` applies msgs; viewport follow |

---

## Mental checklist when adding a verb

1. Implement the Cobra command (works standalone on stdout/stderr as appropriate).
2. Under TUI: gate with `msg.Enabled()`; emit via `msg` — **not** `fmt.Print` to stdout.
3. Plain errors: return `error` / write stderr — TUI appends stderr to the pane.
4. Never emit pane types from background `probe` / `doctor` under TUI.
5. Structured OUTPUT: emit via `msg` + add `tui/output/<verb>/` renderer; plain text uses `EmitText`.
