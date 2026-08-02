package docker

import "testing"

func TestFriendlyPorts(t *testing.T) {
	got := FriendlyPorts([]uint32{443, 80, 80, 0, 81})
	if got != "80, 81, 443" {
		t.Fatalf("got %q", got)
	}
}

func TestFormatReplicaDetail(t *testing.T) {
	if FormatReplicaDetail(1, 2, 1) != "1/2 up (1 starting)" {
		t.Fatal(FormatReplicaDetail(1, 2, 1))
	}
}
