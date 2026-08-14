package kit

import "testing"

func TestReadPrometheus(t *testing.T) {
	raw, err := ReadObs("prometheus/prometheus.yml")
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) == 0 {
		t.Fatal("empty")
	}
	raw2, err := ReadObs("observability/prometheus/prometheus.yml")
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != string(raw2) {
		t.Fatal("prefix trim mismatch")
	}
}

func TestEmbedRelFromHostFile(t *testing.T) {
	rel, ok := EmbedRelFromHostFile("./observability/alloy/config.alloy")
	if !ok || rel != "alloy/config.alloy" {
		t.Fatalf("got %q %v", rel, ok)
	}
}
