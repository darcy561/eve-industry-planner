package nats

import "testing"

func TestNotificationSubjectNeedsBothSegments(t *testing.T) {
	t.Parallel()

	if got := NotificationSubject("account:acct-1", "archiveStatsProcessed"); got != "notify.account:acct-1.archiveStatsProcessed" {
		t.Fatalf("subject = %q", got)
	}
	// An empty segment would collapse the subject into one that matches the wrong
	// tenant, so it produces nothing and the publish is refused.
	if got := NotificationSubject("", "archiveStatsProcessed"); got != "" {
		t.Fatalf("no tenant = %q, want empty", got)
	}
	if got := NotificationSubject("account:acct-1", " "); got != "" {
		t.Fatalf("no subtype = %q, want empty", got)
	}
}

func TestParseNotificationSubjectRoundTrips(t *testing.T) {
	t.Parallel()

	tenant, subtype, ok := parseNotificationSubject(NotificationSubject("account:acct-1", "archiveStatsProcessed"))
	if !ok {
		t.Fatal("a subject this package built should parse")
	}
	if tenant != "account:acct-1" || subtype != "archiveStatsProcessed" {
		t.Fatalf("tenant = %q, subtype = %q", tenant, subtype)
	}

	for _, subject := range []string{"doc.update.account:acct-1.jobs.j1", "notify.account:acct-1", "notify."} {
		if _, _, ok := parseNotificationSubject(subject); ok {
			t.Errorf("%q parsed as a notification", subject)
		}
	}
}

// The wildcard has to match what the publisher builds, or the websocket service
// subscribes to nothing and every notification is dropped in silence.
func TestNotificationFilterMatchesTheSubjectFamily(t *testing.T) {
	t.Parallel()

	if NotificationFilter != "notify.>" {
		t.Fatalf("filter = %q", NotificationFilter)
	}
	if got := NotificationSubject("account:a", "k"); len(got) <= len(SubjectNotify) || got[:len(SubjectNotify)+1] != SubjectNotify+"." {
		t.Fatalf("subject %q is not under the filtered prefix", got)
	}
}

func TestAccountIDFromTenantString(t *testing.T) {
	t.Parallel()

	if id, ok := AccountIDFromTenantString("account:acct-1"); !ok || id != "acct-1" {
		t.Fatalf("id = %q, ok = %v", id, ok)
	}
	// Corporation and alliance tenants are not accounts, and must not be read as
	// one — delivery would look up the wrong client set.
	for _, tenant := range []string{"corporation:corp_1", "alliance:all_1", "account:", ""} {
		if _, ok := AccountIDFromTenantString(tenant); ok {
			t.Errorf("%q read as an account", tenant)
		}
	}
}
