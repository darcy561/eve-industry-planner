package server

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// A message addressed to an audience, end to end: published on the subject a
// producer uses, through the one subscription, to a real socket. Every link
// below this is tested on its own; this is the only thing that proves a producer
// publishing to an audience reaches a browser without a Go file written for its
// family.
func TestIntegrationAnAudienceMessageReachesTheBrowser(t *testing.T) {
	f := newIntegFixture(t)
	nats := f.withAudienceDelivery()

	conn := f.connectAccount("acct-e2e-audience", "sess-e2e-audience")

	frame := []byte(`{"type":"staticData","buildNumber":42}`)
	if err := eipnats.PublishToAudience(nats, eipnats.Everyone(), eipnats.ClientMessageStaticData, "sdeBuildUpdated", frame); err != nil {
		t.Fatalf("PublishToAudience: %v", err)
	}

	got := f.readJSONMessage(conn, 2*time.Second)
	if got["type"] != "staticData" || got["buildNumber"] != float64(42) {
		t.Fatalf("delivered = %v, want the published frame", got)
	}
}

// The owner audience over a real socket: a member of the planner is told, and
// the frame is the one that was published rather than anything this service
// rebuilt.
func TestIntegrationAnOwnerAudienceMessageReachesThatOwnersMember(t *testing.T) {
	f := newIntegFixture(t)
	nats := f.withAudienceDelivery()

	const (
		accountID = "acct-e2e-owner-audience"
		sessionID = "sess-e2e-owner-audience"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)
	conn, _ := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	frame := []byte(`{"type":"notification","subtype":"archiveStatsProcessed"}`)
	if err := eipnats.PublishToAudience(nats, eipnats.Subscribers(corp.Key()), eipnats.ClientMessageNotification, "archiveStatsProcessed", frame); err != nil {
		t.Fatalf("PublishToAudience: %v", err)
	}

	got := f.readJSONMessage(conn, 2*time.Second)
	if got["type"] != "notification" || got["subtype"] != "archiveStatsProcessed" {
		t.Fatalf("delivered = %v, want the published frame", got)
	}
}

// The static data announcement as a producer actually sends it: no Go file in
// this service knows the family, and the frame the browser reads is the one
// AnnounceStaticDataBuild built.
func TestIntegrationAnAnnouncedStaticDataBuildReachesTheBrowser(t *testing.T) {
	f := newIntegFixture(t)
	nats := f.withAudienceDelivery()

	conn := f.connectAccount("acct-e2e-sde", "sess-e2e-sde")

	if err := eipnats.AnnounceStaticDataBuild(nats, 42, "2026-09-13"); err != nil {
		t.Fatalf("AnnounceStaticDataBuild: %v", err)
	}

	got := f.readJSONOfType(conn, eipnats.ClientMessageStaticData, 2*time.Second)
	if buildNumber, _ := got["buildNumber"].(float64); int(buildNumber) != 42 {
		t.Fatalf("buildNumber = %v, want 42: %v", got["buildNumber"], got)
	}
	if version, _ := got["version"].(string); version != "2026-09-13" {
		t.Fatalf("version = %v, want 2026-09-13: %v", got["version"], got)
	}
}

// A corporation planner's notification reaches its members.
//
// Nothing addressed to an organisation owner reached anyone before: the producer
// sent only for accounts and the delivery path discarded anything that was not
// one, so both gates had to go. This is the case neither of them allowed.
func TestIntegrationAnOrganisationNotificationReachesItsMembers(t *testing.T) {
	f := newIntegFixture(t)
	nats := f.withAudienceDelivery()

	const (
		accountID = "acct-e2e-org-notify"
		sessionID = "sess-e2e-org-notify"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)
	conn, _ := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	body := eipnats.ArchiveStatsProcessedNotification{
		OwnerKind:   string(models.OwnerCorporation),
		OwnerID:     corp.ID,
		ProcessedAt: "2026-09-13T00:00:00Z",
	}
	if err := eipnats.PublishNotification(nats, corp.Key(), eipnats.NotificationArchiveStatsProcessed, body); err != nil {
		t.Fatalf("PublishNotification: %v", err)
	}

	got := f.readJSONOfType(conn, eipnats.ClientMessageNotification, 2*time.Second)
	if got["subtype"] != eipnats.NotificationArchiveStatsProcessed {
		t.Fatalf("delivered = %v, want the archive statistics notification", got)
	}
}

// An account's own tabs are subscribers to its own planner, so the account case
// keeps working through the same audience rather than a path of its own.
func TestIntegrationAnAccountNotificationStillReachesItsTabs(t *testing.T) {
	f := newIntegFixture(t)
	nats := f.withAudienceDelivery()

	const accountID = "acct-e2e-own-notify"
	conn := f.connectAccount(accountID, "sess-e2e-own-notify")

	owner := models.AccountOwner(accountID)
	if err := eipnats.PublishNotification(nats, owner.Key(), eipnats.NotificationArchiveStatsProcessed,
		eipnats.ArchiveStatsProcessedNotification{
			OwnerKind:   string(models.OwnerAccount),
			OwnerID:     accountID,
			ProcessedAt: "2026-09-13T00:00:00Z",
		}); err != nil {
		t.Fatalf("PublishNotification: %v", err)
	}

	got := f.readJSONOfType(conn, eipnats.ClientMessageNotification, 2*time.Second)
	if got["subtype"] != eipnats.NotificationArchiveStatsProcessed {
		t.Fatalf("delivered = %v, want the archive statistics notification", got)
	}
}
