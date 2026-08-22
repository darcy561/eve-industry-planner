package server

import (
	"testing"
	"time"
)

func TestIntegrationUpgradeScopesAckAndHosted(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-scopes"
		sessionID = "sess-scopes"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, []int64{99})
	conn := f.dial(sessionID)
	_ = f.readJSONMessage(conn, 2*time.Second)
	f.waitClients(1, 2*time.Second)

	f.writeJSON(conn, map[string]any{
		"type":           "upgrade_scopes",
		"corporationIDs": []string{"10"},
		"allianceIDs":    []string{"99"},
	})
	ack := f.readJSONOfType(conn, "scopes_ack", 2*time.Second)
	if ok, _ := ack["ok"].(bool); !ok {
		t.Fatalf("scopes_ack=%v", ack)
	}
	sub, _ := ack["subscription"].(map[string]any)
	if sub == nil || sub["corporation"] != true || sub["alliance"] != true {
		t.Fatalf("subscription=%v", sub)
	}

	// Tenant keys are expressed in refs, so derive what the ids convert to.
	corpTenant := "corporation:" + wsTestCorpRef(t, 10)
	allianceTenant := "alliance:" + wsTestAllianceRef(t, 99)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if f.Server.HostsTenant(corpTenant) && f.Server.HostsTenant(allianceTenant) {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("hosted=%v, want %s and %s", f.Server.HostedTenants(), corpTenant, allianceTenant)
}

func TestIntegrationSessionResumeRestoresScopes(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-resume"
		sessionID = "sess-resume"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, []int64{99})
	conn1 := f.dial(sessionID)
	connected := f.readJSONMessage(conn1, 2*time.Second)
	prevID, _ := connected["clientID"].(string)
	if prevID == "" {
		t.Fatalf("missing clientID in %v", connected)
	}
	f.waitClients(1, 2*time.Second)

	f.writeJSON(conn1, map[string]any{
		"type":           "upgrade_scopes",
		"corporationIDs": []string{"10"},
		"allianceIDs":    []string{"99"},
	})
	_ = f.readJSONOfType(conn1, "scopes_ack", 2*time.Second)

	_ = conn1.Close()
	f.waitClients(0, 2*time.Second)

	conn2 := f.dial(sessionID)
	_ = f.readJSONMessage(conn2, 2*time.Second) // connected
	f.waitClients(1, 2*time.Second)

	f.writeJSON(conn2, map[string]any{
		"type":             "session_resume",
		"previousClientID": prevID,
	})
	resume := f.readJSONOfType(conn2, "resume_ack", 2*time.Second)
	if skip, _ := resume["skipBaselineSync"].(bool); !skip {
		t.Fatalf("resume_ack=%v want skipBaselineSync", resume)
	}
	scopes := f.readJSONOfType(conn2, "scopes_ack", 2*time.Second)
	sub, _ := scopes["subscription"].(map[string]any)
	if sub == nil || sub["corporation"] != true || sub["alliance"] != true {
		t.Fatalf("scopes after resume=%v", scopes)
	}
	// Tenant keys are expressed in refs, so derive what the ids convert to.
	corpTenant := "corporation:" + wsTestCorpRef(t, 10)
	allianceTenant := "alliance:" + wsTestAllianceRef(t, 99)
	if !f.Server.HostsTenant(corpTenant) || !f.Server.HostsTenant(allianceTenant) {
		t.Fatalf("hosted after resume=%v, want %s and %s", f.Server.HostedTenants(), corpTenant, allianceTenant)
	}
}
