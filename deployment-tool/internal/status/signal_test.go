package status

import "testing"

func TestServiceSignal(t *testing.T) {
	tests := []struct {
		name                   string
		present, exists        bool
		desired, run, starting uint64
		want                   Signal
	}{
		{"no stack", false, false, 0, 0, 0, Down},
		{"missing", true, false, 0, 0, 0, Down},
		{"ok", true, true, 1, 1, 0, OK},
		{"partial run", true, true, 2, 1, 0, Partial},
		{"partial start", true, true, 1, 0, 1, Partial},
		{"down zero", true, true, 1, 0, 0, Down},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _ := ServiceSignal(tt.present, tt.exists, tt.desired, tt.run, tt.starting)
			if got != tt.want {
				t.Fatalf("got %s want %s", got, tt.want)
			}
		})
	}
}

func TestOverallSignal(t *testing.T) {
	sig, _ := OverallSignal(false, 0, 0)
	if sig != Down {
		t.Fatal(sig)
	}
	sig, _ = OverallSignal(true, 0, 0)
	if sig != OK {
		t.Fatal(sig)
	}
	sig, _ = OverallSignal(true, 0, 2)
	if sig != OKStar {
		t.Fatal(sig)
	}
	sig, _ = OverallSignal(true, 3, 0)
	if sig != Problems {
		t.Fatal(sig)
	}
}
