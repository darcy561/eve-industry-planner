package mongo_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	mongoget "eve-industry-planner/shared/core/mongo/get"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Live schema-upgrade get path: clone a real doc, downgrade schemaVersion, Load*
// (new + legacy), assert in-memory + persisted shape. Scratch ids cleaned up.

func TestParity_live_schemaUpgrade_userAndSettings(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	usersColl := mongo.Users.Collection()
	settingsColl := mongo.ApplicationSettings.Collection()

	userID := fmt.Sprintf("%s-upgrade-user", parityScratchAccount)
	settingsID := fmt.Sprintf("%s-upgrade-settings", parityScratchAccount)

	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = usersColl.DeleteOne(cctx, bson.M{"_id": userID})
		_, _ = settingsColl.DeleteOne(cctx, bson.M{"_id": settingsID})
	})

	liveUser, ok := findOneRaw(t, ctx, usersColl)
	if !ok {
		t.Skip("no users documents to clone for schema-upgrade parity")
	}
	liveSettings, okSettings := findOneRaw(t, ctx, settingsColl)

	// --- users: unversioned legacy shape ---
	// UpgradeUserAccountDocument (v0→v1) forces HasCompletedFirstLoginFlow=false, ShareCitadelNames=true.
	userSeed := cloneAsScratchAccount(liveUser, userID)
	delete(userSeed, "schemaVersion")
	userSeed["hasCompletedFirstLoginFlow"] = true  // must be forced false by upgrade
	userSeed["shareCitadelNames"] = false         // must be forced true by upgrade
	userSeed["userCloudAccounts"] = true          // body field must survive

	runUserUpgrade := func(label string, load func() (models.UserAccountDocument, error)) bson.M {
		t.Helper()
		if _, err := usersColl.ReplaceOne(ctx, bson.M{"_id": userID}, userSeed, options.Replace().SetUpsert(true)); err != nil {
			t.Fatalf("%s seed user: %v", label, err)
		}
		// Confirm seed is unversioned on disk
		seedRaw := loadRawByID(t, ctx, usersColl, userID)
		if _, has := seedRaw["schemaVersion"]; has {
			// omitempty may still leave 0 if we set it — we deleted the key
			if v, ok := asInt(seedRaw["schemaVersion"]); ok && v > 0 {
				t.Fatalf("%s seed still has schemaVersion=%v", label, seedRaw["schemaVersion"])
			}
		}

		doc, err := load()
		if err != nil {
			t.Fatalf("%s LoadUserAccount: %v", label, err)
		}
		if doc.SchemaVersion != models.UserAccountDocumentSchemaCurrent {
			t.Fatalf("%s in-memory schemaVersion=%d want %d", label, doc.SchemaVersion, models.UserAccountDocumentSchemaCurrent)
		}
		if doc.HasCompletedFirstLoginFlow {
			t.Fatalf("%s HasCompletedFirstLoginFlow should be forced false by v0→v1 upgrade", label)
		}
		if !doc.ShareCitadelNames {
			t.Fatalf("%s ShareCitadelNames should be forced true by v0→v1 upgrade", label)
		}
		if !doc.UserCloudAccounts {
			t.Fatalf("%s UserCloudAccounts should survive upgrade", label)
		}

		raw := loadRawByID(t, ctx, usersColl, userID)
		ver, ok := asInt(raw["schemaVersion"])
		if !ok || ver != models.UserAccountDocumentSchemaCurrent {
			t.Fatalf("%s persisted schemaVersion=%v want %d", label, raw["schemaVersion"], models.UserAccountDocumentSchemaCurrent)
		}
		if got, _ := raw["hasCompletedFirstLoginFlow"].(bool); got {
			t.Fatalf("%s persisted hasCompletedFirstLoginFlow still true", label)
		}
		if got, _ := raw["shareCitadelNames"].(bool); !got {
			t.Fatalf("%s persisted shareCitadelNames still false", label)
		}
		if got, _ := raw["userCloudAccounts"].(bool); !got {
			t.Fatalf("%s persisted userCloudAccounts lost", label)
		}
		meta, _ := raw["_meta"].(bson.M)
		if got, _ := meta["accountID"].(string); got != userID {
			t.Fatalf("%s persisted _meta.accountID=%q", label, got)
		}
		return raw
	}

	rawUserNew := runUserUpgrade("new", func() (models.UserAccountDocument, error) {
		return mongo.LoadUserAccount(ctx, userID)
	})
	rawUserLegacy := runUserUpgrade("legacy", func() (models.UserAccountDocument, error) {
		return mongoget.LoadUserAccountDocument(ctx, usersColl, userID)
	})
	assertRawEqualIgnoringMetaLastModified(t, "user upgrade new vs legacy", rawUserNew, rawUserLegacy)

	// Idempotent: second load must not change schema again / must match
	again, err := mongo.LoadUserAccount(ctx, userID)
	if err != nil {
		t.Fatalf("second LoadUserAccount: %v", err)
	}
	if again.SchemaVersion != models.UserAccountDocumentSchemaCurrent {
		t.Fatalf("second load schemaVersion=%d", again.SchemaVersion)
	}

	if !okSettings {
		t.Log("user schema-upgrade parity ok (no settings docs to clone)")
		return
	}

	// --- application_settings: unversioned → current ---
	// UpgradeApplicationSettings treats <=0 as current immediately, then persists because
	// beforeSchemaVersion (0) != after (1). Invention clear only runs when still <1 (dead for <=0).
	settingsSeed := cloneAsScratchAccount(liveSettings, settingsID)
	delete(settingsSeed, "schemaVersion")
	settingsSeed["displayHelpCards"] = true // must survive

	runSettingsUpgrade := func(label string, load func(now time.Time) (models.ApplicationSettings, error)) bson.M {
		t.Helper()
		if _, err := settingsColl.ReplaceOne(ctx, bson.M{"_id": settingsID}, settingsSeed, options.Replace().SetUpsert(true)); err != nil {
			t.Fatalf("%s seed settings: %v", label, err)
		}
		now := time.Now().UTC()
		doc, err := load(now)
		if err != nil {
			t.Fatalf("%s LoadApplicationSettings: %v", label, err)
		}
		if doc.SchemaVersion != models.ApplicationSettingsSchemaCurrent {
			t.Fatalf("%s in-memory schemaVersion=%d want %d", label, doc.SchemaVersion, models.ApplicationSettingsSchemaCurrent)
		}
		if !doc.DisplayHelpCards {
			t.Fatalf("%s DisplayHelpCards should survive upgrade", label)
		}

		raw := loadRawByID(t, ctx, settingsColl, settingsID)
		ver, ok := asInt(raw["schemaVersion"])
		if !ok || ver != models.ApplicationSettingsSchemaCurrent {
			t.Fatalf("%s persisted schemaVersion=%v want %d", label, raw["schemaVersion"], models.ApplicationSettingsSchemaCurrent)
		}
		if got, _ := raw["displayHelpCards"].(bool); !got {
			t.Fatalf("%s persisted displayHelpCards lost", label)
		}
		meta, _ := raw["_meta"].(bson.M)
		if got, _ := meta["accountID"].(string); got != settingsID {
			t.Fatalf("%s persisted _meta.accountID=%q", label, got)
		}
		return raw
	}

	rawSetNew := runSettingsUpgrade("new", func(now time.Time) (models.ApplicationSettings, error) {
		return mongo.LoadApplicationSettings(ctx, settingsID, now)
	})
	rawSetLegacy := runSettingsUpgrade("legacy", func(now time.Time) (models.ApplicationSettings, error) {
		return mongoget.LoadApplicationSettingsDocument(ctx, settingsColl, settingsID, now)
	})
	assertRawEqualIgnoringMetaLastModified(t, "settings upgrade new vs legacy", rawSetNew, rawSetLegacy)

	t.Log("schema-upgrade user/settings parity ok")
}

func findOneRaw(t *testing.T, ctx context.Context, coll *mongo.Collection) (bson.M, bool) {
	t.Helper()
	var raw bson.M
	err := coll.FindOne(ctx, bson.M{}).Decode(&raw)
	if err == mongo.ErrNoDocuments {
		return nil, false
	}
	if err != nil {
		t.Fatalf("findOne %s: %v", coll.Name(), err)
	}
	return eipmongo.AsDocumentM(raw), true
}

// cloneAsScratchAccount rewrites _id and _meta.accountID for isolated upgrade tests.
func cloneAsScratchAccount(src bson.M, scratchID string) bson.M {
	out := bson.M{}
	for k, v := range src {
		out[k] = v
	}
	out["_id"] = scratchID
	meta := bson.M{}
	if existing, ok := out["_meta"].(bson.M); ok {
		for k, v := range existing {
			meta[k] = v
		}
	}
	meta["accountID"] = scratchID
	out["_meta"] = meta
	return out
}

func asInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	default:
		return 0, false
	}
}
