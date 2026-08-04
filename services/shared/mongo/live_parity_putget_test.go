package mongo_test

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	legacy "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const parityScratchAccount = "eip-parity-account"

// Live put/get parity against stack Mongo. Requires EIP_MONGO_PARITY_LIVE=1.
// Scratch docs use account eip-parity-account and are deleted in cleanup.

func TestParity_live_getJobsGroupsAccount(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	jobsChecked := parityGetJobs(t, ctx, mongo)
	groupsChecked := parityGetGroups(t, ctx, mongo)
	usersChecked := parityGetUsers(t, ctx, mongo)
	settingsChecked := parityGetSettings(t, ctx, mongo)
	watchChecked := parityGetWatchlist(t, ctx, mongo)

	t.Logf("live get parity: jobs=%d groups=%d users=%d settings=%d watchlist=%d",
		jobsChecked, groupsChecked, usersChecked, settingsChecked, watchChecked)
	if jobsChecked+groupsChecked+usersChecked+settingsChecked+watchChecked == 0 {
		t.Fatal("no sample documents found in live Mongo for get parity")
	}
}

func TestParity_live_putGetJobsGroupsRoundtrip(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	jobs := mongo.JobDocuments
	groups := mongo.Groups
	jobsColl := jobs.Collection()
	groupsColl := groups.Collection()

	t.Cleanup(func() {
		cleanupCtx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = jobsColl.DeleteMany(cleanupCtx, bson.M{"_meta.accountID": parityScratchAccount})
		_, _ = groupsColl.DeleteMany(cleanupCtx, bson.M{"_meta.accountID": parityScratchAccount})
	})

	sampleJob, ok := findOneJob(t, ctx, jobsColl)
	if !ok {
		t.Skip("no job documents in live Mongo to clone for put parity")
	}
	sampleGroup, okGroup := findOneGroup(t, ctx, groupsColl)

	now := time.Now().UTC().Truncate(time.Millisecond)
	jobID := fmt.Sprintf("eip-parity-job-%d", now.UnixNano())
	clone := sampleJob
	clone.JobID = jobID
	clone.MetaData.AccountID = parityScratchAccount
	clone.Name = "eip-parity-clone"

	// New write → legacy read
	if _, failed, err := jobs.BulkUpsertJobs(ctx, parityScratchAccount, []models.Job{clone}, now, "parity-sess", "parity-client"); err != nil || failed != 0 {
		t.Fatalf("new BulkUpsertJobs: failed=%d err=%v", failed, err)
	}
	legacyGot, err := mongoget.LoadJobByID(ctx, jobsColl, parityScratchAccount, jobID)
	if err != nil {
		t.Fatalf("legacy LoadJobByID after new write: %v", err)
	}
	assertJobParity(t, "new→legacy", clone, legacyGot, now, parityScratchAccount, "parity-sess", "parity-client")

	// Legacy write → new read (mutate name)
	clone.Name = "eip-parity-legacy-write"
	now2 := now.Add(time.Second)
	if _, failed, err := mongoput.BulkUpsertJobDocuments(ctx, jobsColl, parityScratchAccount, []models.Job{clone}, now2, "parity-sess-2", "parity-client-2"); err != nil || failed != 0 {
		t.Fatalf("legacy BulkUpsertJobDocuments: failed=%d err=%v", failed, err)
	}
	newGot, err := jobs.LoadJobByID(ctx, parityScratchAccount, jobID)
	if err != nil {
		t.Fatalf("new LoadJobByID after legacy write: %v", err)
	}
	assertJobParity(t, "legacy→new", clone, newGot, now2, parityScratchAccount, "parity-sess-2", "parity-client-2")

	if okGroup {
		groupID := fmt.Sprintf("eip-parity-group-%d", now.UnixNano())
		g := sampleGroup
		g.GroupID = groupID
		g.AccountID = parityScratchAccount
		g.MetaData.AccountID = parityScratchAccount
		g.GroupName = "eip-parity-group"
		g.IncludedJobIDs = []string{jobID, "eip-parity-extra-job"}

		res, err := groups.BulkUpsertGroups(ctx, parityScratchAccount, []models.Group{g}, now, "parity-sess", "parity-client")
		if err != nil {
			t.Fatalf("new BulkUpsertGroups: %v", err)
		}
		if res == nil || res.FailedCount != 0 {
			t.Fatalf("new BulkUpsertGroups unexpected result: %+v", res)
		}
		legacyGroup, err := mongoget.LoadGroupByID(ctx, groupsColl, parityScratchAccount, groupID)
		if err != nil {
			t.Fatalf("legacy LoadGroupByID after new write: %v", err)
		}
		assertGroupParity(t, "new→legacy", g, legacyGroup, now, parityScratchAccount, "parity-sess", "parity-client")

		// Membership delta: grow IncludedJobIDs via legacy write, then new write with more IDs
		g.IncludedJobIDs = []string{jobID}
		g.GroupName = "eip-parity-group-2"
		now3 := now.Add(2 * time.Second)
		legacyRes, err := mongoput.BulkUpsertGroups(ctx, groupsColl, parityScratchAccount, []models.Group{g}, now3, "parity-sess-3", "parity-client-3")
		if err != nil {
			t.Fatalf("legacy BulkUpsertGroups: %v", err)
		}
		_ = legacyRes
		newGroup, err := groups.LoadGroupByID(ctx, parityScratchAccount, groupID)
		if err != nil {
			t.Fatalf("new LoadGroupByID after legacy write: %v", err)
		}
		assertGroupParity(t, "legacy→new", g, newGroup, now3, parityScratchAccount, "parity-sess-3", "parity-client-3")

		// Delta parity: both should report the same AddedJobIDs when growing membership
		g.IncludedJobIDs = []string{jobID, "delta-a", "delta-b"}
		now4 := now.Add(3 * time.Second)
		// Reset to single job via raw update so both paths see same prev snapshot
		_, err = groupsColl.UpdateOne(ctx,
			bson.M{"_id": groupID, "_meta.accountID": parityScratchAccount},
			bson.M{"$set": bson.M{"includedJobIDs": []string{jobID}}},
		)
		if err != nil {
			t.Fatalf("reset includedJobIDs: %v", err)
		}
		newDelta, err := groups.BulkUpsertGroups(ctx, parityScratchAccount, []models.Group{g}, now4, "", "")
		if err != nil {
			t.Fatalf("new BulkUpsertGroups for delta: %v", err)
		}
		_, err = groupsColl.UpdateOne(ctx,
			bson.M{"_id": groupID, "_meta.accountID": parityScratchAccount},
			bson.M{"$set": bson.M{"includedJobIDs": []string{jobID}}},
		)
		if err != nil {
			t.Fatalf("reset includedJobIDs before legacy: %v", err)
		}
		legacyDelta, err := mongoput.BulkUpsertGroups(ctx, groupsColl, parityScratchAccount, []models.Group{g}, now4, "", "")
		if err != nil {
			t.Fatalf("legacy BulkUpsertGroups for delta: %v", err)
		}
		gotAdded := collectAddedJobIDs(newDelta.Deltas)
		wantAdded := collectAddedJobIDsLegacy(legacyDelta.Deltas)
		if !stringSetEqual(gotAdded, wantAdded) {
			t.Fatalf("membership delta AddedJobIDs new=%v legacy=%v", gotAdded, wantAdded)
		}
	}

	t.Log("live put/get job(+group) roundtrip parity ok")
}

func requireLiveMongo(t *testing.T) *eipmongo.Mongo {
	t.Helper()
	if os.Getenv("EIP_MONGO_PARITY_LIVE") != "1" {
		t.Skip("set EIP_MONGO_PARITY_LIVE=1 to run against stack Mongo")
	}
	mongo, err := eipmongo.ConnectPrimary()
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		mongo.Disconnect(ctx)
	})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := mongo.Ping(ctx); err != nil {
		t.Fatalf("ping: %v", err)
	}
	return mongo
}

func parityGetJobs(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo) int {
	t.Helper()
	coll := mongo.JobDocuments.Collection()
	cur, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(15))
	if err != nil {
		t.Fatalf("jobs find: %v", err)
	}
	defer cur.Close(ctx)
	n := 0
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			t.Fatalf("decode: %v", err)
		}
		jobID, accountID := docIDAndAccount(raw)
		if jobID == "" || accountID == "" {
			continue
		}
		if !liveGetPairMatch(t, ctx, jobID, func() (any, error) {
			return mongoget.LoadJobByID(ctx, coll, accountID, jobID)
		}, func() (any, error) {
			return mongo.JobDocuments.LoadJobByID(ctx, accountID, jobID)
		}) {
			continue
		}
		n++
	}
	return n
}

func parityGetGroups(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo) int {
	t.Helper()
	coll := mongo.Groups.Collection()
	cur, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(15))
	if err != nil {
		t.Fatalf("groups find: %v", err)
	}
	defer cur.Close(ctx)
	n := 0
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			t.Fatalf("decode: %v", err)
		}
		groupID, accountID := docIDAndAccount(raw)
		if groupID == "" || accountID == "" {
			continue
		}
		if !liveGetPairMatch(t, ctx, groupID, func() (any, error) {
			return mongoget.LoadGroupByID(ctx, coll, accountID, groupID)
		}, func() (any, error) {
			return mongo.Groups.LoadGroupByID(ctx, accountID, groupID)
		}) {
			continue
		}
		n++
	}
	// One account-level list compare if we saw any group.
	if n > 0 {
		var raw bson.M
		err := coll.FindOne(ctx, bson.M{}).Decode(&raw)
		if err == nil {
			_, accountID := docIDAndAccount(raw)
			if accountID != "" {
				legacyList, errL := mongoget.LoadGroupsByAccount(ctx, coll, accountID)
				newList, errN := mongo.Groups.LoadGroupsByAccount(ctx, accountID)
				if (errL == nil) != (errN == nil) {
					t.Fatalf("LoadGroupsByAccount err new=%v legacy=%v", errN, errL)
				}
				if errN == nil && len(legacyList) != len(newList) {
					t.Fatalf("LoadGroupsByAccount len new=%d legacy=%d", len(newList), len(legacyList))
				}
				if errN == nil {
					byID := map[string]models.Group{}
					for _, g := range legacyList {
						byID[g.GroupID] = g
					}
					for _, g := range newList {
						lg, ok := byID[g.GroupID]
						if !ok || !groupsEqual(lg, g) {
							t.Fatalf("LoadGroupsByAccount content mismatch for %s", g.GroupID)
						}
					}
				}
			}
		}
	}
	return n
}

func parityGetUsers(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo) int {
	t.Helper()
	coll := mongo.Users.Collection()
	cur, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(10))
	if err != nil {
		t.Fatalf("users find: %v", err)
	}
	defer cur.Close(ctx)
	n := 0
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			t.Fatalf("decode: %v", err)
		}
		accountID, _ := raw["_id"].(string)
		if accountID == "" {
			continue
		}
		// Load may persist schema upgrades — both paths must end equal.
		legacyDoc, errL := mongoget.LoadUserAccountDocument(ctx, coll, accountID)
		newDoc, errN := mongo.LoadUserAccount(ctx, accountID)
		if (errL == nil) != (errN == nil) {
			t.Fatalf("user %s err new=%v legacy=%v", accountID, errN, errL)
		}
		if errN != nil {
			continue
		}
		if !reflect.DeepEqual(legacyDoc, newDoc) {
			// Re-load both after possible upgrade race from ordering.
			legacyDoc, errL = mongoget.LoadUserAccountDocument(ctx, coll, accountID)
			newDoc, errN = mongo.LoadUserAccount(ctx, accountID)
			if errL != nil || errN != nil || !reflect.DeepEqual(legacyDoc, newDoc) {
				t.Fatalf("user %s get mismatch", accountID)
			}
		}
		n++
	}
	return n
}

func parityGetSettings(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo) int {
	t.Helper()
	coll := mongo.ApplicationSettings.Collection()
	cur, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(10))
	if err != nil {
		t.Fatalf("settings find: %v", err)
	}
	defer cur.Close(ctx)
	now := time.Now().UTC()
	n := 0
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			t.Fatalf("decode: %v", err)
		}
		accountID, _ := raw["_id"].(string)
		if accountID == "" {
			continue
		}
		legacyDoc, errL := mongoget.LoadApplicationSettingsDocument(ctx, coll, accountID, now)
		newDoc, errN := mongo.LoadApplicationSettings(ctx, accountID, now)
		if (errL == nil) != (errN == nil) {
			t.Fatalf("settings %s err new=%v legacy=%v", accountID, errN, errL)
		}
		if errN != nil {
			continue
		}
		if !reflect.DeepEqual(legacyDoc, newDoc) {
			legacyDoc, errL = mongoget.LoadApplicationSettingsDocument(ctx, coll, accountID, now)
			newDoc, errN = mongo.LoadApplicationSettings(ctx, accountID, now)
			if errL != nil || errN != nil || !reflect.DeepEqual(legacyDoc, newDoc) {
				t.Fatalf("settings %s get mismatch", accountID)
			}
		}
		n++
	}
	return n
}

func parityGetWatchlist(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo) int {
	t.Helper()
	coll := mongo.WatchlistDeprecated.Collection()
	cur, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(5))
	if err != nil {
		t.Fatalf("watchlist find: %v", err)
	}
	defer cur.Close(ctx)
	n := 0
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			t.Fatalf("decode: %v", err)
		}
		accountID, _ := raw["_id"].(string)
		if accountID == "" {
			continue
		}
		legacyDoc, errL := mongoget.LoadWatchlistDeprecated(ctx, coll, accountID)
		newDoc, errN := mongo.WatchlistDeprecated.LoadWatchlistDeprecated(ctx, accountID)
		if (errL == nil) != (errN == nil) {
			t.Fatalf("watchlist %s err new=%v legacy=%v", accountID, errN, errL)
		}
		if errN != nil {
			continue
		}
		if !asDocumentMEqual(eipmongo.AsDocumentM(newDoc), legacy.AsDocumentM(legacyDoc)) {
			t.Fatalf("watchlist %s get mismatch", accountID)
		}
		n++
	}
	return n
}

func findOneJob(t *testing.T, ctx context.Context, coll *mongo.Collection) (models.Job, bool) {
	t.Helper()
	var raw bson.M
	err := coll.FindOne(ctx, bson.M{}).Decode(&raw)
	if err == mongo.ErrNoDocuments {
		return models.Job{}, false
	}
	if err != nil {
		t.Fatalf("findOne job: %v", err)
	}
	id, accountID := docIDAndAccount(raw)
	if id == "" || accountID == "" {
		return models.Job{}, false
	}
	job, err := mongoget.LoadJobByID(ctx, coll, accountID, id)
	if err != nil {
		t.Fatalf("load sample job: %v", err)
	}
	if job.JobID == "" {
		job.JobID = id
	}
	return job, true
}

func findOneGroup(t *testing.T, ctx context.Context, coll *mongo.Collection) (models.Group, bool) {
	t.Helper()
	var raw bson.M
	err := coll.FindOne(ctx, bson.M{}).Decode(&raw)
	if err == mongo.ErrNoDocuments {
		return models.Group{}, false
	}
	if err != nil {
		t.Fatalf("findOne group: %v", err)
	}
	id, accountID := docIDAndAccount(raw)
	if id == "" || accountID == "" {
		return models.Group{}, false
	}
	g, err := mongoget.LoadGroupByID(ctx, coll, accountID, id)
	if err != nil {
		t.Fatalf("load sample group: %v", err)
	}
	if g.GroupID == "" {
		g.GroupID = id
	}
	return g, true
}

func docIDAndAccount(raw bson.M) (id, accountID string) {
	id, _ = raw["_id"].(string)
	switch meta := raw["_meta"].(type) {
	case bson.M:
		accountID, _ = meta["accountID"].(string)
	}
	return id, accountID
}

func assertJobParity(t *testing.T, label string, wantSeed, got models.Job, now time.Time, accountID, sessionID, clientID string) {
	t.Helper()
	if got.JobID != wantSeed.JobID {
		t.Fatalf("%s jobID: got %q want %q", label, got.JobID, wantSeed.JobID)
	}
	if got.Name != wantSeed.Name {
		t.Fatalf("%s name: got %q want %q", label, got.Name, wantSeed.Name)
	}
	if got.MetaData.AccountID != accountID {
		t.Fatalf("%s accountID: got %q", label, got.MetaData.AccountID)
	}
	if got.MetaData.SessionID != sessionID || got.MetaData.ClientID != clientID {
		t.Fatalf("%s session/client: got %q/%q want %q/%q", label, got.MetaData.SessionID, got.MetaData.ClientID, sessionID, clientID)
	}
	if !got.MetaData.LastModified.Equal(now) {
		t.Fatalf("%s lastModified: got %v want %v", label, got.MetaData.LastModified, now)
	}
	if got.MetaData.LastUpdatedBy != accountID {
		t.Fatalf("%s lastUpdatedBy: got %q", label, got.MetaData.LastUpdatedBy)
	}
}

func assertGroupParity(t *testing.T, label string, wantSeed, got models.Group, now time.Time, accountID, sessionID, clientID string) {
	t.Helper()
	if got.GroupID != wantSeed.GroupID {
		t.Fatalf("%s groupID mismatch", label)
	}
	if got.GroupName != wantSeed.GroupName {
		t.Fatalf("%s groupName: got %q want %q", label, got.GroupName, wantSeed.GroupName)
	}
	if got.MetaData.AccountID != accountID || got.AccountID != accountID {
		t.Fatalf("%s account fields: meta=%q root=%q", label, got.MetaData.AccountID, got.AccountID)
	}
	if got.MetaData.SessionID != sessionID || got.MetaData.ClientID != clientID {
		t.Fatalf("%s session/client mismatch", label)
	}
	if !got.MetaData.LastModified.Equal(now) {
		t.Fatalf("%s lastModified: got %v want %v", label, got.MetaData.LastModified, now)
	}
	if !reflect.DeepEqual(got.IncludedJobIDs, wantSeed.IncludedJobIDs) {
		t.Fatalf("%s includedJobIDs: got %v want %v", label, got.IncludedJobIDs, wantSeed.IncludedJobIDs)
	}
}

func groupsEqual(a, b models.Group) bool {
	return reflect.DeepEqual(a, b)
}

// liveGetPairMatch loads via legacy and new paths. Retries once on mismatch to
// absorb concurrent stack writers between the two reads.
func liveGetPairMatch(t *testing.T, ctx context.Context, id string, legacyFn, newFn func() (any, error)) bool {
	t.Helper()
	for attempt := 0; attempt < 2; attempt++ {
		want, errL := legacyFn()
		got, errN := newFn()
		if (errL == nil) != (errN == nil) {
			t.Fatalf("%s err new=%v legacy=%v", id, errN, errL)
		}
		if errN != nil {
			return false
		}
		// Struct DeepEqual — not bson.Marshal — so map fields (e.g. job build.setup)
		// are not flaky from BSON key order.
		if reflect.DeepEqual(want, got) {
			return true
		}
		if attempt == 0 {
			continue
		}
		t.Fatalf("%s get mismatch after retry (types %T vs %T)", id, want, got)
	}
	return false
}

func collectAddedJobIDs(deltas []eipmongo.GroupMembershipDelta) []string {
	var out []string
	for _, d := range deltas {
		out = append(out, d.AddedJobIDs...)
	}
	return out
}

func collectAddedJobIDsLegacy(deltas []mongoput.GroupMembershipDelta) []string {
	var out []string
	for _, d := range deltas {
		out = append(out, d.AddedJobIDs...)
	}
	return out
}

func stringSetEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	set := make(map[string]struct{}, len(a))
	for _, s := range a {
		set[s] = struct{}{}
	}
	for _, s := range b {
		if _, ok := set[s]; !ok {
			return false
		}
	}
	return true
}
