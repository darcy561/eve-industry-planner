package images

import (
	"errors"
	"strings"
	"testing"

	jsonmessage "github.com/moby/moby/api/types/jsonstream"
)

func TestRenderBar(t *testing.T) {
	wantIndeterminate := "[" + strings.Repeat("·", pullBarWidth) + "]"
	if got := renderBar(0, 0); got != wantIndeterminate {
		t.Fatalf("indeterminate: %q want %q", got, wantIndeterminate)
	}
	full := renderBar(10, 10)
	if got := renderBar(100, 100); got != full {
		t.Fatalf("full bar mismatch: %q vs %q", got, full)
	}
	if renderBar(0, 10) == full {
		t.Fatal("empty should differ from full")
	}
	// Clamp >100%.
	if got := renderBar(200, 100); got != full {
		t.Fatalf("overfill: %q", got)
	}
}

func TestFormatBytesPair(t *testing.T) {
	if got := formatBytesPair(0, 0); got != "…" {
		t.Fatalf("got %q", got)
	}
	got := formatBytesPair(512, 1024)
	if !strings.Contains(got, "/") {
		t.Fatalf("got %q", got)
	}
}

func TestShortImageLabel(t *testing.T) {
	long := "ghcr.io/darcy561/eve-industry-planner-api:prerelease-swarm-hard-cutover"
	got := shortImageLabel(long, 20)
	if len([]rune(got)) > 20 {
		t.Fatalf("too long: %q", got)
	}
	if got == long {
		t.Fatal("expected truncation/shortening")
	}
	if got := shortImageLabel("redis:8", 36); got != "redis:8" {
		t.Fatalf("short unchanged: %q", got)
	}
}

func TestPadRightAndTruncate(t *testing.T) {
	if got := padRight("ab", 4); got != "ab  " {
		t.Fatalf("pad: %q", got)
	}
	if got := truncateRunes("abcdef", 4); got != "abc…" {
		t.Fatalf("trunc: %q", got)
	}
	if got := truncateRunes("ab", 4); got != "ab" {
		t.Fatalf("short: %q", got)
	}
	if got := truncateRunes("x", 0); got != "" {
		t.Fatalf("zero: %q", got)
	}
}

func TestPullBoardRenderStates(t *testing.T) {
	b := newPullBoard([]string{"redis:8", "mongo:8", "bad:1"}, 4)
	b.cliTTY = false
	b.mu.Lock()
	b.rows["redis:8"].status = "pulling"
	b.rows["redis:8"].current = 50
	b.rows["redis:8"].total = 100
	b.rows["mongo:8"].status = "done"
	b.rows["mongo:8"].upToDate = true
	b.rows["mongo:8"].total = 1000
	b.rows["mongo:8"].current = 1000
	b.rows["bad:1"].status = "error"
	b.rows["bad:1"].err = "boom"
	text := b.renderLocked()
	b.mu.Unlock()

	for _, want := range []string{
		"Pulling 3 images (4 parallel)",
		"redis:8",
		"mongo:8",
		"up to date",
		"ERROR",
		"boom",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in:\n%s", want, text)
		}
	}
	if strings.Contains(text, "  waiting") {
		t.Fatalf("unexpected waiting row:\n%s", text)
	}
}

func TestPullBoardOnJSONAggregatesLayers(t *testing.T) {
	b := newPullBoard([]string{"img:1"}, 1)
	b.cliTTY = false
	b.onJSON("img:1", jsonmessage.Message{
		ID: "layer1", Status: "Downloading",
		Progress: &jsonmessage.Progress{Current: 10, Total: 40},
	})
	b.onJSON("img:1", jsonmessage.Message{
		ID: "layer2", Status: "Downloading",
		Progress: &jsonmessage.Progress{Current: 20, Total: 60},
	})
	b.mu.Lock()
	cur, tot := b.rows["img:1"].current, b.rows["img:1"].total
	b.mu.Unlock()
	if cur != 30 || tot != 100 {
		t.Fatalf("got %d/%d want 30/100", cur, tot)
	}
}

func TestPullBoardSetDoneAndError(t *testing.T) {
	b := newPullBoard([]string{"a:1", "b:1"}, 2)
	b.cliTTY = false
	b.setDone("a:1", false, 2048)
	b.setError("b:1", errors.New("nope"))
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.rows["a:1"].status != "done" || b.rows["a:1"].total != 2048 {
		t.Fatalf("done row: %+v", b.rows["a:1"])
	}
	if b.rows["b:1"].status != "error" || b.rows["b:1"].err != "nope" {
		t.Fatalf("error row: %+v", b.rows["b:1"])
	}
	if f := b.fractionLocked(); f != 1 {
		t.Fatalf("both finished → fraction=%v want 1", f)
	}
}

func TestPullBoardFraction(t *testing.T) {
	b := newPullBoard([]string{"a:1", "b:1"}, 2)
	b.cliTTY = false
	b.mu.Lock()
	if f := b.fractionLocked(); f != 0 {
		t.Fatalf("waiting → %v", f)
	}
	b.mu.Unlock()

	b.setDone("a:1", false, 100)
	b.mu.Lock()
	if f := b.fractionLocked(); f != 0.5 {
		t.Fatalf("one done → %v", f)
	}
	b.mu.Unlock()

	b.onJSON("b:1", jsonmessage.Message{
		ID: "L", Status: "Downloading",
		Progress: &jsonmessage.Progress{Current: 25, Total: 100},
	})
	b.mu.Lock()
	// 1.0 (a done) + 0.25 (b pulling) / 2 = 0.625
	if f := b.fractionLocked(); f < 0.62 || f > 0.63 {
		t.Fatalf("partial pull → %v", f)
	}
	b.mu.Unlock()
}

func TestPullBoardIgnoresUnknownRef(t *testing.T) {
	b := newPullBoard([]string{"known:1"}, 1)
	b.cliTTY = false
	b.onJSON("missing:1", jsonmessage.Message{Status: "Downloading"})
	b.setDone("missing:1", true, 1)
	b.setError("missing:1", errors.New("x"))
}
