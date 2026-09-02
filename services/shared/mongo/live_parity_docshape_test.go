package mongo_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Live document-shape coverage: submitted payload, meta stamps, $unset, preserving-meta.
// Requires EIP_MONGO_PARITY_LIVE=1. Uses scratch account eip-parity-account.

func TestLive_docShape_jobUpsert(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	jobs := mongo.JobDocuments
	coll := jobs.Collection()
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteMany(cctx, bson.M{"_meta.accountID": parityScratchAccount})
	})

	sample, ok := findOneJob(t, ctx, mongo)
	if !ok {
		t.Skip("no job documents to clone")
	}

	now := time.Now().UTC().Truncate(time.Millisecond)
	jobID := fmt.Sprintf("eip-parity-shape-job-%d", now.UnixNano())

	// Seed with root junk that $unset must clear.
	seed := bson.M{
		"_id":              jobID,
		"jobID":            jobID,
		"name":             "before-upsert",
		"jobType":          sample.JobType,
		"itemID":           sample.ItemID,
		"accountID":        "stale-root-account",
		"archived":         true,
		"archiveTimeStamp": now.Add(-time.Hour),
		"archiveProcessed": true,
		"deleted":          true,
		"deletedTimeStamp": now.Add(-time.Hour),
		"_meta": bson.M{
			"accountID":    parityScratchAccount,
			"lastModified": now.Add(-time.Hour),
			"sessionID":    "old-sess",
			"clientID":     "old-client",
		},
	}
	if _, err := coll.ReplaceOne(ctx, bson.M{"_id": jobID}, seed, replaceUpsert()); err != nil {
		t.Fatalf("seed job: %v", err)
	}

	clone := sample
	clone.JobID = jobID
	clone.Name = "shape-after-upsert"
	clone.MetaData = models.JobMetaData{} // clear sample meta; put path stamps account/session/client

	assertJobRawShape := func(label string, raw bson.M, wantName, wantSess, wantClient string, wantMod time.Time) {
		t.Helper()
		if got, _ := raw["_id"].(string); got != jobID {
			t.Fatalf("%s _id=%q", label, got)
		}
		if got, _ := raw["jobID"].(string); got != jobID {
			t.Fatalf("%s jobID=%q", label, got)
		}
		if got, _ := raw["name"].(string); got != wantName {
			t.Fatalf("%s name=%q want %q", label, got, wantName)
		}
		for _, k := range []string{"accountID", "archived", "archiveTimeStamp", "archiveProcessed", "deleted", "deletedTimeStamp"} {
			if _, ok := raw[k]; ok {
				t.Fatalf("%s: root %q still present after upsert", label, k)
			}
		}
		meta, ok := raw["_meta"].(bson.M)
		if !ok {
			t.Fatalf("%s: _meta missing or wrong type %T", label, raw["_meta"])
		}
		if got, _ := meta["accountID"].(string); got != parityScratchAccount {
			t.Fatalf("%s _meta.accountID=%q", label, got)
		}
		if got, _ := meta["sessionID"].(string); got != wantSess {
			t.Fatalf("%s _meta.sessionID=%q want %q", label, got, wantSess)
		}
		if got, _ := meta["clientID"].(string); got != wantClient {
			t.Fatalf("%s _meta.clientID=%q want %q", label, got, wantClient)
		}
		mod, ok := metaTime(meta["lastModified"])
		if !ok || !mod.Equal(wantMod) {
			t.Fatalf("%s _meta.lastModified=%v want %v", label, meta["lastModified"], wantMod)
		}
		if got, _ := meta["lastUpdatedBy"].(string); got != parityScratchAccount {
			t.Fatalf("%s _meta.lastUpdatedBy=%q", label, got)
		}
	}

	if _, failed, err := jobs.BulkUpsertJobs(ctx, parityScratchAccount, []models.Job{clone}, now, "shape-sess", "shape-client"); err != nil || failed != 0 {
		t.Fatalf("BulkUpsertJobs: failed=%d err=%v", failed, err)
	}
	raw := loadRawByID(t, ctx, coll, jobID)
	assertJobRawShape("upsert", raw, "shape-after-upsert", "shape-sess", "shape-client", now)

	// Empty session/client inputs: ApplyMetaSessionClient is a no-op; struct still carries prior stamps → kept.
	now2 := now.Add(time.Second)
	clone.Name = "shape-empty-meta-inputs"
	clone.MetaData.SessionID = "shape-sess"
	clone.MetaData.ClientID = "shape-client"
	if _, failed, err := jobs.BulkUpsertJobs(ctx, parityScratchAccount, []models.Job{clone}, now2, "", ""); err != nil || failed != 0 {
		t.Fatalf("BulkUpsertJobs empty meta inputs: failed=%d err=%v", failed, err)
	}
	rawKeep := loadRawByID(t, ctx, coll, jobID)
	assertJobRawShape("empty-inputs", rawKeep, "shape-empty-meta-inputs", "shape-sess", "shape-client", now2)

	t.Log("job doc-shape ok")
}

func TestLive_docShape_preservingMetaUserAndSettings(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	users := mongo.Users
	settings := mongo.ApplicationSettings
	usersColl := users.Collection()
	settingsColl := settings.Collection()

	userID := fmt.Sprintf("%s-user", parityScratchAccount)
	settingsID := fmt.Sprintf("%s-settings", parityScratchAccount)

	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = usersColl.DeleteMany(cctx, bson.M{"_id": userID})
		_, _ = settingsColl.DeleteMany(cctx, bson.M{"_id": settingsID})
	})

	createdAt := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
	seedMod := createdAt.Add(24 * time.Hour)

	seedUser := bson.M{
		"_id":                        userID,
		"schemaVersion":              models.UserAccountDocumentSchemaCurrent,
		"linkedJobs":                 []int64{1},
		"linkedTrans":                []int64{},
		"linkedOrders":               []int64{},
		"userCloudAccounts":          false,
		"hasCompletedFirstLoginFlow": true,
		"shareCitadelNames":          true,
		"refreshTokens":              bson.A{},
		"_meta": bson.M{
			"accountID":    userID,
			"lastModified": seedMod,
			"sessionID":    "seed-sess",
			"clientID":     "seed-client",
			"createdAt":    createdAt,
			"lastLoginAt":  createdAt,
		},
	}
	if _, err := usersColl.ReplaceOne(ctx, bson.M{"_id": userID}, seedUser, replaceUpsert()); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	// Incoming struct tries to change session/createdAt; preserving-meta must keep seed session/createdAt.
	// On update: incoming clientID is applied; sessionID / createdAt from existing meta are preserved.
	incoming := models.DefaultUserAccountDocument(userID, time.Now().UTC())
	incoming.ShareCitadelNames = false
	incoming.HasCompletedFirstLoginFlow = true
	incoming.LinkedJobs = []int64{1, 2, 3}
	incoming.MetaData.SessionID = "should-not-replace-session"
	incoming.MetaData.ClientID = "new-client"
	incoming.MetaData.CreatedAt = time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)

	before := time.Now().UTC()
	if _, _, err := users.UpsertUserAccount(ctx, userID, incoming); err != nil {
		t.Fatalf("UpsertUserAccount: %v", err)
	}
	after := time.Now().UTC()
	rawUser := loadRawByID(t, ctx, usersColl, userID)
	assertPreservingUserShape(t, rawUser, userID, createdAt, "seed-sess", "new-client", false, []int64{1, 2, 3}, before, after)

	// Application settings — same preserving-meta contract
	seedSettings := bson.M{
		"_id":                            settingsID,
		"schemaVersion":                  models.ApplicationSettingsSchemaCurrent,
		"displayHelpCards":               true,
		"defaultMarketLocation":          "jita",
		"defaultOrderType":               "sell",
		"enableCompactLayoutView":        false,
		"shareCitadelNames":              true,
		"defaultCitadelBrokersFee":       1.0,
		"defaultMaterialEfficiencyValue": 10,
		"_meta": bson.M{
			"accountID":    settingsID,
			"lastModified": seedMod,
			"sessionID":    "settings-seed-sess",
			"clientID":     "settings-seed-client",
		},
	}
	if _, err := settingsColl.ReplaceOne(ctx, bson.M{"_id": settingsID}, seedSettings, replaceUpsert()); err != nil {
		t.Fatalf("seed settings: %v", err)
	}

	inSettings := models.DefaultApplicationSettings(settingsID, time.Now().UTC())
	inSettings.DisplayHelpCards = false
	inSettings.DefaultMarketLocation = "amarr"
	inSettings.MetaData.SessionID = "should-not-win"
	inSettings.MetaData.ClientID = "settings-new-client"

	before = time.Now().UTC()
	if _, _, err := settings.UpsertApplicationSettings(ctx, settingsID, inSettings); err != nil {
		t.Fatalf("UpsertApplicationSettings: %v", err)
	}
	after = time.Now().UTC()
	rawSet := loadRawByID(t, ctx, settingsColl, settingsID)
	assertPreservingSettingsShape(t, rawSet, settingsID, "settings-seed-sess", "settings-new-client", false, "amarr", before, after)

	t.Log("preserving-meta user/settings doc-shape ok")
}

func TestLive_docShape_watchlistReplace(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	wl := mongo.WatchlistDeprecated
	coll := wl.Collection()
	accountID := fmt.Sprintf("%s-watch", parityScratchAccount)
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteOne(cctx, bson.M{"_id": accountID})
	})

	now := time.Now().UTC().Truncate(time.Millisecond)
	groups := []any{bson.M{"name": "g1"}}
	items := []any{bson.M{"typeID": 34}}

	if _, err := wl.UpsertWatchlistDeprecated(ctx, accountID, groups, items, now, "wl-sess", "wl-client"); err != nil {
		t.Fatalf("UpsertWatchlistDeprecated: %v", err)
	}
	raw := loadRawByID(t, ctx, coll, accountID)
	assertWatchlistShape(t, raw, accountID, now, "wl-sess", "wl-client")

	t.Log("watchlist doc-shape ok")
}

func replaceUpsert() *options.ReplaceOptionsBuilder {
	return options.Replace().SetUpsert(true)
}

func loadRawByID(t *testing.T, ctx context.Context, coll *mongodriver.Collection, id string) bson.M {
	t.Helper()
	var raw bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&raw); err != nil {
		t.Fatalf("load %s: %v", id, err)
	}
	return eipmongo.AsDocumentM(raw)
}

func metaTime(v any) (time.Time, bool) {
	switch t := v.(type) {
	case time.Time:
		return t.UTC(), true
	case bson.DateTime:
		return t.Time().UTC(), true
	default:
		return time.Time{}, false
	}
}

func assertPreservingUserShape(
	t *testing.T, raw bson.M, userID string, createdAt time.Time,
	wantSess, wantClient string, wantShare bool, wantJobs []int64, modAfter, modBeforeBound time.Time,
) {
	t.Helper()
	if got, _ := raw["shareCitadelNames"].(bool); got != wantShare {
		t.Fatalf("shareCitadelNames=%v want %v", got, wantShare)
	}
	gotJobs, _ := int64Slice(raw["linkedJobs"])
	if !int64SliceEqual(gotJobs, wantJobs) {
		t.Fatalf("linkedJobs=%v want %v", gotJobs, wantJobs)
	}
	meta, ok := raw["_meta"].(bson.M)
	if !ok {
		t.Fatalf("_meta type %T", raw["_meta"])
	}
	if got, _ := meta["accountID"].(string); got != userID {
		t.Fatalf("accountID=%q", got)
	}
	if got, _ := meta["sessionID"].(string); got != wantSess {
		t.Fatalf("sessionID=%q want %q (must preserve seed)", got, wantSess)
	}
	if got, _ := meta["clientID"].(string); got != wantClient {
		t.Fatalf("clientID=%q want %q", got, wantClient)
	}
	gotCreated, ok := metaTime(meta["createdAt"])
	if !ok || !gotCreated.Equal(createdAt) {
		t.Fatalf("createdAt=%v want %v", meta["createdAt"], createdAt)
	}
	mod, ok := metaTime(meta["lastModified"])
	if !ok || mod.Before(modAfter.Add(-2*time.Second)) || mod.After(modBeforeBound.Add(2*time.Second)) {
		t.Fatalf("lastModified=%v not in [%v,%v]", mod, modAfter, modBeforeBound)
	}
}

func assertPreservingSettingsShape(
	t *testing.T, raw bson.M, accountID, wantSess, wantClient string,
	wantHelp bool, wantMarket string, modAfter, modBeforeBound time.Time,
) {
	t.Helper()
	if got, _ := raw["displayHelpCards"].(bool); got != wantHelp {
		t.Fatalf("displayHelpCards=%v want %v", got, wantHelp)
	}
	if got, _ := raw["defaultMarketLocation"].(string); got != wantMarket {
		t.Fatalf("defaultMarketLocation=%q want %q", got, wantMarket)
	}
	meta, ok := raw["_meta"].(bson.M)
	if !ok {
		t.Fatalf("_meta type %T", raw["_meta"])
	}
	if got, _ := meta["accountID"].(string); got != accountID {
		t.Fatalf("accountID=%q", got)
	}
	if got, _ := meta["sessionID"].(string); got != wantSess {
		t.Fatalf("sessionID=%q want %q", got, wantSess)
	}
	if got, _ := meta["clientID"].(string); got != wantClient {
		t.Fatalf("clientID=%q want %q", got, wantClient)
	}
	mod, ok := metaTime(meta["lastModified"])
	if !ok || mod.Before(modAfter.Add(-2*time.Second)) || mod.After(modBeforeBound.Add(2*time.Second)) {
		t.Fatalf("lastModified=%v not in [%v,%v]", mod, modAfter, modBeforeBound)
	}
}

func assertWatchlistShape(t *testing.T, raw bson.M, accountID string, now time.Time, sess, client string) {
	t.Helper()
	if got, _ := raw["_id"].(string); got != accountID {
		t.Fatalf("_id=%q", got)
	}
	if _, ok := raw["groups"].(bson.A); !ok {
		if _, ok := raw["groups"].([]any); !ok {
			t.Fatalf("groups type %T", raw["groups"])
		}
	}
	if _, ok := raw["items"].(bson.A); !ok {
		if _, ok := raw["items"].([]any); !ok {
			t.Fatalf("items type %T", raw["items"])
		}
	}
	meta, ok := raw["_meta"].(bson.M)
	if !ok {
		t.Fatalf("_meta type %T", raw["_meta"])
	}
	if got, _ := meta["accountID"].(string); got != accountID {
		t.Fatalf("accountID=%q", got)
	}
	if got, _ := meta["sessionID"].(string); got != sess {
		t.Fatalf("sessionID=%q", got)
	}
	if got, _ := meta["clientID"].(string); got != client {
		t.Fatalf("clientID=%q", got)
	}
	mod, ok := metaTime(meta["lastModified"])
	if !ok || !mod.Equal(now) {
		t.Fatalf("lastModified=%v want %v", meta["lastModified"], now)
	}
}

func int64Slice(v any) ([]int64, bool) {
	switch a := v.(type) {
	case bson.A:
		out := make([]int64, 0, len(a))
		for _, x := range a {
			switch n := x.(type) {
			case int64:
				out = append(out, n)
			case int32:
				out = append(out, int64(n))
			case float64:
				out = append(out, int64(n))
			default:
				return nil, false
			}
		}
		return out, true
	case []int64:
		return a, true
	default:
		return nil, false
	}
}

func int64SliceEqual(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
