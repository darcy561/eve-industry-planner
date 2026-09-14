package nats

import (
	"strings"
	"testing"
)

func TestDeliverSubjectNamesTheAudienceAndItsTarget(t *testing.T) {
	t.Parallel()

	if got := DeliverSubject(Subscribers("account:acct-1"), ClientMessageNotification, "archiveStatsProcessed"); got != "deliver.subscribers.account:acct-1.notification.archiveStatsProcessed" {
		t.Fatalf("subject = %q", got)
	}
	// An audience addressing no owner still fills the target slot, so every
	// subject in the space has the same shape and one parser reads all of them.
	if got := DeliverSubject(Everyone(), ClientMessageStaticData, "sdeBuildUpdated"); got != "deliver.everyone.all.staticData.sdeBuildUpdated" {
		t.Fatalf("subject = %q", got)
	}
}

// A segment carrying a dot or a wildcard would split into extra tokens and
// address a subject nobody subscribes to, so it yields no subject at all rather
// than a plausible wrong one.
func TestDeliverSubjectRefusesASegmentItCannotPlaceInOneToken(t *testing.T) {
	t.Parallel()

	for name, subject := range map[string]string{
		"dotted subtype":   DeliverSubject(Everyone(), ClientMessageStaticData, "sde.build.updated"),
		"wildcard subtype": DeliverSubject(Everyone(), ClientMessageStaticData, "*"),
		"reaching subtype": DeliverSubject(Everyone(), ClientMessageStaticData, ">"),
		"empty subtype":    DeliverSubject(Everyone(), ClientMessageStaticData, "  "),
		"empty family":     DeliverSubject(Everyone(), " ", "sdeBuildUpdated"),
		"dotted family":    DeliverSubject(Everyone(), "static.data", "sdeBuildUpdated"),
		"no target":        DeliverSubject(Subscribers(""), ClientMessageNotification, "archiveStatsProcessed"),
		"dotted target":    DeliverSubject(Subscribers("account.acct-1"), ClientMessageNotification, "archiveStatsProcessed"),
	} {
		if subject != "" {
			t.Fatalf("%s produced %q, want no subject", name, subject)
		}
	}
}

func TestParseDeliverSubjectReadsBackWhatWasBuilt(t *testing.T) {
	t.Parallel()

	got, ok := parseDeliverSubject(DeliverSubject(Subscribers("corporation:corp_56_JxK"), ClientMessageNotification, "archiveStatsProcessed"))
	if !ok {
		t.Fatal("a subject this package built did not parse")
	}
	if got.Audience != AudienceSubscribers || got.Target != "corporation:corp_56_JxK" ||
		got.Family != ClientMessageNotification || got.Subtype != "archiveStatsProcessed" {
		t.Fatalf("parsed = %+v", got)
	}
}

// The audience space must not overlap the subjects the existing families travel,
// which is what lets the new delivery path run beside them while publishers move
// across one at a time. A message can reach the new path or an old one, never
// both.
func TestTheAudienceSpaceDoesNotOverlapTheExistingFamilies(t *testing.T) {
	t.Parallel()

	audienceSubjects := []string{
		DeliverSubject(Everyone(), ClientMessageStaticData, "sdeBuildUpdated"),
		DeliverSubject(Subscribers("account:acct-1"), ClientMessageNotification, "archiveStatsProcessed"),
	}
	for _, subject := range audienceSubjects {
		if subjectMatchesFilter(subject, SubjectDocUpdate+".>") {
			t.Fatalf("%q is matched by the document filter", subject)
		}
		if subject == SubjectCoreSDEBuildUpdated {
			t.Fatalf("%q is the static data subject", subject)
		}
	}

	foreign := []string{
		DocUpdateSubject("account:acct-1", "jobs", "d1"),
		SubjectCoreSDEBuildUpdated,
	}
	for _, subject := range foreign {
		if subjectMatchesFilter(subject, DeliverFilter) {
			t.Fatalf("%q is matched by %q", subject, DeliverFilter)
		}
		if _, ok := parseDeliverSubject(subject); ok {
			t.Fatalf("%q reads as an audience message", subject)
		}
	}
}

// subjectMatchesFilter answers the one NATS wildcard form these filters use,
// "prefix.>", which is enough for the spaces being compared here.
func subjectMatchesFilter(subject, filter string) bool {
	prefix, reaches := strings.CutSuffix(filter, ">")
	if !reaches {
		return subject == filter
	}
	return len(subject) > len(prefix) && subject[:len(prefix)] == prefix
}
