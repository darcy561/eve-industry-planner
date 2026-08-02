package pane

import "testing"

func TestBufferAppendHistory(t *testing.T) {
	var b Buffer
	b.Append("Running Status…")
	b.Append("── App ──\n  API  OK")
	b.AppendBlank()
	b.Append("Running Up…")
	want := "Running Status…\n── App ──\n  API  OK\n\nRunning Up…"
	if b.Text != want {
		t.Fatalf("got %q want %q", b.Text, want)
	}
}

func TestBufferClear(t *testing.T) {
	b := Buffer{Text: "x"}
	b.Clear()
	if b.Text != "" {
		t.Fatal(b.Text)
	}
}
