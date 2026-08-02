package process

import (
	"fmt"
	"os"
	"time"

	"golang.org/x/term"
)

// Default TUI console size when the host window is still a stock small console.
// Tuned for Setup / document builders (dual pane); ~matches a ~1270×980 WT window.
const (
	defaultTUICols = 160
	defaultTUIRows = 50
)

// EnsureTUIConsoleSize grows the attached terminal when width or height is below
// the defaults. Never shrinks a larger window.
//
// Uses xterm CSI 8 ; rows ; cols t. Honored by Windows Terminal, xterm, kitty,
// wezterm, and many GTK/Qt terminals; ignored by hosts that disallow app resize
// (some tmux/SSH setups, locked desktop profiles). Do not mix with Win32
// SetConsoleScreenBufferSize / SetConsoleWindowInfo — that desyncs ConPTY.
func EnsureTUIConsoleSize() {
	ensureConsoleMinSize(defaultTUICols, defaultTUIRows)
}

func ensureConsoleMinSize(minCols, minRows int) {
	if minCols < 40 || minRows < 20 {
		return
	}
	if !term.IsTerminal(int(os.Stdout.Fd())) {
		return
	}
	curCols, curRows, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil {
		return
	}
	wantCols, wantRows, grow := consoleWantSize(curCols, curRows, minCols, minRows)
	if !grow {
		return
	}

	_, _ = fmt.Fprintf(os.Stdout, "\x1b[8;%d;%dt", wantRows, wantCols)
	_ = os.Stdout.Sync()
	time.Sleep(50 * time.Millisecond)
}

func consoleWantSize(curCols, curRows, minCols, minRows int) (wantCols, wantRows int, grow bool) {
	if curCols >= minCols && curRows >= minRows {
		return curCols, curRows, false
	}
	wantCols, wantRows = curCols, curRows
	if wantCols < minCols {
		wantCols = minCols
	}
	if wantRows < minRows {
		wantRows = minRows
	}
	return wantCols, wantRows, wantCols > curCols || wantRows > curRows
}
