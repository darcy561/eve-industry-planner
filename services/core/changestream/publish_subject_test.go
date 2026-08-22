package changestream

import (
	"testing"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/wsplacement"
)

func TestPublishSubjectMatchesLockedShape(t *testing.T) {
	t.Parallel()
	const (
		corpRef     = "corp_56_J_DzQdPpjXwi9Xtp3C8bri9Bfi0Z94qUulkbKCac"
		allianceRef = "alliance_DWc0i6y_cTAGa4QSZWC0S94Zm7vUclxiUNHlNPthzvc"
	)

	tenant := wsplacement.TenantStringFromRouting("acct-1", corpRef, "")
	got := natscore.DocUpdateSubject(tenant, "userJobDocuments", "doc-1")
	want := "doc.update.account:acct-1.userJobDocuments.doc-1"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if natscore.DocUpdateSubject("", "c", "d") != "" {
		t.Fatal("missing tenant must not invent subject")
	}
	if wsplacement.TenantStringFromRouting("", corpRef, allianceRef) != "corporation:"+corpRef {
		t.Fatal("corp precedence")
	}
	// Organisations route by ref; a raw id must not produce a subject.
	if wsplacement.TenantStringFromRouting("", "98765432", "") != "" {
		t.Fatal("a raw corporation id must not build a tenant string")
	}
}
