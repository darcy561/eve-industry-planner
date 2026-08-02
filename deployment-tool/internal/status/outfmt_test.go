package status

import (
	"strings"
	"testing"
)

func TestSection(t *testing.T) {
	if Section("App") != "── App ──" {
		t.Fatal(Section("App"))
	}
}

func TestPlainRowAlignment(t *testing.T) {
	row := PlainRow("API", "OK", "1/1 up", "8080")
	if !strings.HasPrefix(row, "  ") {
		t.Fatal(row)
	}
	if !strings.Contains(row, "ports 8080") {
		t.Fatal(row)
	}
	lab, sig, rest := RowParts("API", "OK", "1/1 up", "")
	if len(lab) != LabelWidth || len(sig) != SignalWidth {
		t.Fatalf("lab=%d sig=%d", len(lab), len(sig))
	}
	if rest != "1/1 up" {
		t.Fatal(rest)
	}
}

func TestTaskLine(t *testing.T) {
	if TaskLine("x") != "      - x" {
		t.Fatal(TaskLine("x"))
	}
}
