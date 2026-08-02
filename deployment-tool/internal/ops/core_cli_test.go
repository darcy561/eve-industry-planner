package ops

import "testing"

func TestIsNewSoleOwner(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		sole     string
		baseline []string
		want     bool
	}{
		{name: "empty sole", sole: "", baseline: []string{"a"}, want: false},
		{name: "empty baseline", sole: "new", baseline: nil, want: true},
		{name: "still old", sole: "old", baseline: []string{"old", "other"}, want: false},
		{name: "new owner", sole: "new", baseline: []string{"old"}, want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isNewSoleOwner(tc.sole, tc.baseline); got != tc.want {
				t.Fatalf("isNewSoleOwner(%q, %v)=%v want %v", tc.sole, tc.baseline, got, tc.want)
			}
		})
	}
}

func TestFailBadUpdate(t *testing.T) {
	t.Parallel()
	if err := failBadUpdate("updating", ""); err != nil {
		t.Fatalf("updating should be ok: %v", err)
	}
	if err := failBadUpdate("paused", "stuck"); err == nil {
		t.Fatal("paused should fail")
	}
	if err := failBadUpdate("rollback_started", ""); err == nil {
		t.Fatal("rollback_started should fail")
	}
}

func TestCoreServiceName(t *testing.T) {
	t.Setenv("EIP_STACK_NAME", "eip")
	t.Setenv("EIP_CORE_SERVICE", "")
	if got := coreServiceName(); got != "eip_core" {
		t.Fatalf("got %q", got)
	}
	t.Setenv("EIP_CORE_SERVICE", "custom_core")
	if got := coreServiceName(); got != "custom_core" {
		t.Fatalf("got %q", got)
	}
}
