package primaryhandoff

import "testing"

func TestResumeTokenKey(t *testing.T) {
	got := ResumeTokenKey("planner")
	want := "eip:core:handoff:v1:cs:resume:planner"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if Prefix != "eip:core:handoff:v1:" {
		t.Fatalf("Prefix %q", Prefix)
	}
}
