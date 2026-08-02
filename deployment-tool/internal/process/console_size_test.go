package process

import "testing"

func TestConsoleWantSize(t *testing.T) {
	t.Parallel()
	cols, rows, grow := consoleWantSize(80, 25, 160, 50)
	if !grow || cols != 160 || rows != 50 {
		t.Fatalf("got %dx%d grow=%v", cols, rows, grow)
	}
	cols, rows, grow = consoleWantSize(120, 50, 160, 50)
	if !grow || cols != 160 || rows != 50 {
		t.Fatalf("width-only: %dx%d grow=%v", cols, rows, grow)
	}
	cols, rows, grow = consoleWantSize(200, 60, 160, 50)
	if grow || cols != 200 || rows != 60 {
		t.Fatalf("already large: %dx%d grow=%v", cols, rows, grow)
	}
}
