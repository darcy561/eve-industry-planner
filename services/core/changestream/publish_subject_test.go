package changestream

import (
	"testing"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/wsplacement"
)

func TestPublishSubjectMatchesLockedShape(t *testing.T) {
	t.Parallel()
	tenant := wsplacement.TenantStringFromRouting("acct-1", "corp-9", "")
	got := natscore.DocUpdateSubject(tenant, "userJobDocuments", "doc-1")
	want := "doc.update.account:acct-1.userJobDocuments.doc-1"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if natscore.DocUpdateSubject("", "c", "d") != "" {
		t.Fatal("missing tenant must not invent subject")
	}
	if wsplacement.TenantStringFromRouting("", "c", "z") != "corporation:c" {
		t.Fatal("corp precedence")
	}
}
