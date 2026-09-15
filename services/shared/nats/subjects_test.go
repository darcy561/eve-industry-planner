package nats

import "testing"

func TestDocUpdateSubject(t *testing.T) {
	t.Parallel()
	if got := DocUpdateSubject("account:a1", "jobs", "d1"); got != "doc.update.account:a1.jobs.d1" {
		t.Fatalf("got %q", got)
	}
	if DocUpdateSubject("", "jobs", "d1") != "" {
		t.Fatal("empty tenant should yield empty subject")
	}
}

func TestDocUpdateFiltersForHostedTenants(t *testing.T) {
	t.Parallel()
	got := DocUpdateFiltersForHostedTenants(nil)
	if len(got) != 1 || got[0] != DocUpdateFilterInert {
		t.Fatalf("empty hosted → inert, got %v", got)
	}
	got = DocUpdateFiltersForHostedTenants([]string{"account:a1", "corporation:9"})
	want := []string{"doc.update.account:a1.>", "doc.update.corporation:9.>"}
	if !subjectsAsSetEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

// A lock belongs to the planner holding the document, so every owner kind gets a
// filter — a corporation planner's members have to receive each other's locks.
func TestDocLockFiltersForHostedTenants(t *testing.T) {
	t.Parallel()
	got := DocLockFiltersForHostedTenants([]string{"account:7", "corporation:1", "alliance:2"})
	want := []string{"doc.lock.account:7", "doc.lock.corporation:1", "doc.lock.alliance:2"}
	if !subjectsAsSetEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}

	if got := DocLockFiltersForHostedTenants([]string{"", "  "}); len(got) != 1 || got[0] != DocLockFilterInert {
		t.Fatalf("no tenants → inert, got %v", got)
	}
}

func TestNormalizeFilterSubjects(t *testing.T) {
	t.Parallel()
	got := NormalizeFilterSubjects([]string{" b ", "", "a", "b"})
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("got %v", got)
	}
}
