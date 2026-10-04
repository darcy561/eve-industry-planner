package mongo_test

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestLive_schemaUpgrade_userAndSettings(t *testing.T) {
	mongo := mongolive.Require(t)
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
		t.Skip("no users documents to clone for schema-upgrade")
	}
	liveSettings, okSettings := findOneRaw(t, ctx, settingsColl)

	userSeed := cloneAsScratchAccount(liveUser, userID)
	delete(userSeed, "schemaVersion")
	userSeed["hasCompletedFirstLoginFlow"] = true
	userSeed["shareCitadelNames"] = false
	userSeed["userCloudAccounts"] = true

	if _, err := usersColl.ReplaceOne(ctx, bson.M{"_id": userID}, userSeed, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	seedRaw := loadRawByID(t, ctx, usersColl, userID)
	if v, ok := asInt(seedRaw["schemaVersion"]); ok && v > 0 {
		t.Fatalf("seed still has schemaVersion=%v", seedRaw["schemaVersion"])
	}

	doc, err := mongo.LoadUserAccount(ctx, userID)
	if err != nil {
		t.Fatalf("LoadUserAccount: %v", err)
	}
	if doc.SchemaVersion != models.UserAccountDocumentSchemaCurrent {
		t.Fatalf("in-memory schemaVersion=%d want %d", doc.SchemaVersion, models.UserAccountDocumentSchemaCurrent)
	}
	if doc.HasCompletedFirstLoginFlow {
		t.Fatalf("HasCompletedFirstLoginFlow should be forced false by v0→v1 upgrade")
	}
	if !doc.ShareCitadelNames {
		t.Fatalf("ShareCitadelNames should be forced true by v0→v1 upgrade")
	}
	if !doc.UserCloudAccounts {
		t.Fatalf("UserCloudAccounts should survive upgrade")
	}

	raw := loadRawByID(t, ctx, usersColl, userID)
	ver, ok := asInt(raw["schemaVersion"])
	if !ok || ver != models.UserAccountDocumentSchemaCurrent {
		t.Fatalf("persisted schemaVersion=%v want %d", raw["schemaVersion"], models.UserAccountDocumentSchemaCurrent)
	}
	if got, _ := raw["hasCompletedFirstLoginFlow"].(bool); got {
		t.Fatalf("persisted hasCompletedFirstLoginFlow still true")
	}
	if got, _ := raw["shareCitadelNames"].(bool); !got {
		t.Fatalf("persisted shareCitadelNames still false")
	}
	if got, _ := raw["userCloudAccounts"].(bool); !got {
		t.Fatalf("persisted userCloudAccounts lost")
	}
	meta, _ := raw["_meta"].(bson.M)
	owner, _ := meta["owner"].(bson.M)
	if got, _ := owner["id"].(string); got != userID {
		t.Fatalf("persisted _meta.owner.id=%q, want %q", got, userID)
	}

	again, err := mongo.LoadUserAccount(ctx, userID)
	if err != nil {
		t.Fatalf("second LoadUserAccount: %v", err)
	}
	if again.SchemaVersion != models.UserAccountDocumentSchemaCurrent {
		t.Fatalf("second load schemaVersion=%d", again.SchemaVersion)
	}

	if !okSettings {
		t.Log("user schema-upgrade ok (no settings docs to clone)")
		return
	}

	settingsSeed := cloneAsScratchAccount(liveSettings, settingsID)
	delete(settingsSeed, "schemaVersion")
	settingsSeed["displayHelpCards"] = true

	if _, err := settingsColl.ReplaceOne(ctx, bson.M{"_id": settingsID}, settingsSeed, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	now := time.Now().UTC()
	settingsDoc, err := mongo.LoadApplicationSettings(ctx, settingsID, now)
	if err != nil {
		t.Fatalf("LoadApplicationSettings: %v", err)
	}
	if settingsDoc.SchemaVersion != models.ApplicationSettingsSchemaCurrent {
		t.Fatalf("in-memory schemaVersion=%d want %d", settingsDoc.SchemaVersion, models.ApplicationSettingsSchemaCurrent)
	}
	if !settingsDoc.DisplayHelpCards {
		t.Fatalf("DisplayHelpCards should survive upgrade")
	}

	rawSet := loadRawByID(t, ctx, settingsColl, settingsID)
	ver, ok = asInt(rawSet["schemaVersion"])
	if !ok || ver != models.ApplicationSettingsSchemaCurrent {
		t.Fatalf("persisted schemaVersion=%v want %d", rawSet["schemaVersion"], models.ApplicationSettingsSchemaCurrent)
	}
	if got, _ := rawSet["displayHelpCards"].(bool); !got {
		t.Fatalf("persisted displayHelpCards lost")
	}
	meta, _ = rawSet["_meta"].(bson.M)
	owner, _ = meta["owner"].(bson.M)
	if got, _ := owner["id"].(string); got != settingsID {
		t.Fatalf("persisted _meta.owner.id=%q, want %q", got, settingsID)
	}

	t.Log("schema-upgrade user/settings ok")
}

func findOneRaw(t *testing.T, ctx context.Context, coll *mongodriver.Collection) (bson.M, bool) {
	t.Helper()
	var raw bson.M
	err := coll.FindOne(ctx, bson.M{}).Decode(&raw)
	if errors.Is(err, mongodriver.ErrNoDocuments) {
		return nil, false
	}
	if err != nil {
		t.Fatalf("findOne %s: %v", coll.Name(), err)
	}
	return eipmongo.AsDocumentM(raw), true
}

func cloneAsScratchAccount(src bson.M, scratchID string) bson.M {
	out := bson.M{}
	maps.Copy(out, src)
	out["_id"] = scratchID
	meta := bson.M{}
	if existing, ok := out["_meta"].(bson.M); ok {
		maps.Copy(meta, existing)
	}
	meta[models.MetaFieldOwner] = mongolive.OwnerDoc(models.AccountOwner(scratchID))
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
