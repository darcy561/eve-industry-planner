package changestream

import (
	"testing"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

func TestPublishSubjectMatchesLockedShape(t *testing.T) {
	t.Parallel()
	tenant := models.AccountOwner("acct-1").Key()
	got := eipnats.DocUpdateSubject(tenant, "userJobDocuments", "doc-1")
	want := "doc.update.account:acct-1.userJobDocuments.doc-1"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if eipnats.DocUpdateSubject("", "c", "d") != "" {
		t.Fatal("missing tenant must not invent subject")
	}
	// Organisations route by ref; a raw id yields a zero owner, which keys nothing.
	if !models.CorporationOwner("98765432").IsZero() {
		t.Fatal("a raw corporation id must not build an owner")
	}
}
