package mongo_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

const parityScratchAccount = "eip-parity-account"

// Live put/get against stack Mongo via shared/mongo only.
// Requires EIP_MONGO_PARITY_LIVE=1. Scratch docs use eip-parity-account and are deleted in cleanup.

func TestLive_putGetJobsGroupsRoundtrip(t *testing.T) {
	mongo := mongolive.Require(t)
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

	sampleJob, ok := findOneJob(t, ctx, mongo)
	if !ok {
		t.Skip("no job documents in live Mongo to clone for put roundtrip")
	}
	sampleGroup, okGroup := findOneGroup(t, ctx, mongo)

	now := time.Now().UTC().Truncate(time.Millisecond)
	jobID := fmt.Sprintf("eip-parity-job-%d", now.UnixNano())
	clone := sampleJob
	clone.JobID = jobID
	clone.MetaData.AccountID = parityScratchAccount
	clone.Name = "eip-parity-clone"

	if _, failed, err := jobs.BulkUpsertJobs(ctx, parityScratchAccount, []models.Job{clone}, now, "parity-sess", "parity-client"); err != nil || failed != 0 {
		t.Fatalf("BulkUpsertJobs: failed=%d err=%v", failed, err)
	}
	got, err := jobs.LoadJobByID(ctx, parityScratchAccount, jobID)
	if err != nil {
		t.Fatalf("LoadJobByID after write: %v", err)
	}
	assertJobRoundtrip(t, clone, got, now, parityScratchAccount, "parity-sess", "parity-client")

	clone.Name = "eip-parity-rewrite"
	now2 := now.Add(time.Second)
	if _, failed, err := jobs.BulkUpsertJobs(ctx, parityScratchAccount, []models.Job{clone}, now2, "parity-sess-2", "parity-client-2"); err != nil || failed != 0 {
		t.Fatalf("BulkUpsertJobs rewrite: failed=%d err=%v", failed, err)
	}
	got2, err := jobs.LoadJobByID(ctx, parityScratchAccount, jobID)
	if err != nil {
		t.Fatalf("LoadJobByID after rewrite: %v", err)
	}
	assertJobRoundtrip(t, clone, got2, now2, parityScratchAccount, "parity-sess-2", "parity-client-2")

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
			t.Fatalf("BulkUpsertGroups: %v", err)
		}
		if res == nil || res.FailedCount != 0 {
			t.Fatalf("BulkUpsertGroups unexpected result: %+v", res)
		}
		gotGroup, err := groups.LoadGroupByID(ctx, parityScratchAccount, groupID)
		if err != nil {
			t.Fatalf("LoadGroupByID after write: %v", err)
		}
		assertGroupRoundtrip(t, g, gotGroup, now, parityScratchAccount, "parity-sess", "parity-client")

		g.IncludedJobIDs = []string{jobID}
		g.GroupName = "eip-parity-group-2"
		now3 := now.Add(2 * time.Second)
		if _, err := groups.BulkUpsertGroups(ctx, parityScratchAccount, []models.Group{g}, now3, "parity-sess-3", "parity-client-3"); err != nil {
			t.Fatalf("BulkUpsertGroups rewrite: %v", err)
		}
		gotGroup2, err := groups.LoadGroupByID(ctx, parityScratchAccount, groupID)
		if err != nil {
			t.Fatalf("LoadGroupByID after rewrite: %v", err)
		}
		assertGroupRoundtrip(t, g, gotGroup2, now3, parityScratchAccount, "parity-sess-3", "parity-client-3")

		// Membership delta: grow IncludedJobIDs and assert AddedJobIDs.
		g.IncludedJobIDs = []string{jobID, "delta-a", "delta-b"}
		now4 := now.Add(3 * time.Second)
		_, err = groupsColl.UpdateOne(ctx,
			bson.M{"_id": groupID, "_meta.accountID": parityScratchAccount},
			bson.M{"$set": bson.M{"includedJobIDs": []string{jobID}}},
		)
		if err != nil {
			t.Fatalf("reset includedJobIDs: %v", err)
		}
		delta, err := groups.BulkUpsertGroups(ctx, parityScratchAccount, []models.Group{g}, now4, "", "")
		if err != nil {
			t.Fatalf("BulkUpsertGroups for delta: %v", err)
		}
		gotAdded := collectAddedJobIDs(delta.Deltas)
		if !stringSetEqual(gotAdded, []string{"delta-a", "delta-b"}) {
			t.Fatalf("membership delta AddedJobIDs=%v want [delta-a delta-b]", gotAdded)
		}
	}

	t.Log("live put/get job(+group) roundtrip ok")
}

func findOneJob(t *testing.T, ctx context.Context, m *eipmongo.Mongo) (models.Job, bool) {
	t.Helper()
	coll := m.JobDocuments.Collection()
	var raw bson.M
	err := coll.FindOne(ctx, bson.M{"jobID": bson.M{"$type": "string", "$ne": ""}}).Decode(&raw)
	if errors.Is(err, mongodriver.ErrNoDocuments) {
		return models.Job{}, false
	}
	if err != nil {
		t.Fatalf("findOne job: %v", err)
	}
	id, accountID := docIDAndAccount(raw)
	if field, _ := raw["jobID"].(string); field != "" {
		id = field
	}
	if id == "" || accountID == "" {
		return models.Job{}, false
	}
	job, err := m.JobDocuments.LoadJobByID(ctx, accountID, id)
	if err != nil {
		t.Fatalf("load sample job: %v", err)
	}
	if job.JobID == "" {
		job.JobID = id
	}
	return job, true
}

func findOneGroup(t *testing.T, ctx context.Context, m *eipmongo.Mongo) (models.Group, bool) {
	t.Helper()
	coll := m.Groups.Collection()
	var raw bson.M
	err := coll.FindOne(ctx, bson.M{"groupID": bson.M{"$type": "string", "$ne": ""}}).Decode(&raw)
	if errors.Is(err, mongodriver.ErrNoDocuments) {
		return models.Group{}, false
	}
	if err != nil {
		t.Fatalf("findOne group: %v", err)
	}
	id, accountID := docIDAndAccount(raw)
	if field, _ := raw["groupID"].(string); field != "" {
		id = field
	}
	if id == "" || accountID == "" {
		return models.Group{}, false
	}
	g, err := m.Groups.LoadGroupByID(ctx, accountID, id)
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

func assertJobRoundtrip(t *testing.T, wantSeed, got models.Job, now time.Time, accountID, sessionID, clientID string) {
	t.Helper()
	if got.JobID != wantSeed.JobID {
		t.Fatalf("jobID: got %q want %q", got.JobID, wantSeed.JobID)
	}
	if got.Name != wantSeed.Name {
		t.Fatalf("name: got %q want %q", got.Name, wantSeed.Name)
	}
	if got.MetaData.AccountID != accountID {
		t.Fatalf("accountID: got %q", got.MetaData.AccountID)
	}
	if got.MetaData.SessionID != sessionID || got.MetaData.ClientID != clientID {
		t.Fatalf("session/client: got %q/%q want %q/%q", got.MetaData.SessionID, got.MetaData.ClientID, sessionID, clientID)
	}
	if !got.MetaData.LastModified.Equal(now) {
		t.Fatalf("lastModified: got %v want %v", got.MetaData.LastModified, now)
	}
	if got.MetaData.LastUpdatedBy != accountID {
		t.Fatalf("lastUpdatedBy: got %q", got.MetaData.LastUpdatedBy)
	}
}

func assertGroupRoundtrip(t *testing.T, wantSeed, got models.Group, now time.Time, accountID, sessionID, clientID string) {
	t.Helper()
	if got.GroupID != wantSeed.GroupID {
		t.Fatalf("groupID mismatch")
	}
	if got.GroupName != wantSeed.GroupName {
		t.Fatalf("groupName: got %q want %q", got.GroupName, wantSeed.GroupName)
	}
	if got.MetaData.AccountID != accountID || got.AccountID != accountID {
		t.Fatalf("account fields: meta=%q root=%q", got.MetaData.AccountID, got.AccountID)
	}
	if got.MetaData.SessionID != sessionID || got.MetaData.ClientID != clientID {
		t.Fatalf("session/client mismatch")
	}
	if !got.MetaData.LastModified.Equal(now) {
		t.Fatalf("lastModified: got %v want %v", got.MetaData.LastModified, now)
	}
	if !reflect.DeepEqual(got.IncludedJobIDs, wantSeed.IncludedJobIDs) {
		t.Fatalf("includedJobIDs: got %v want %v", got.IncludedJobIDs, wantSeed.IncludedJobIDs)
	}
}

func collectAddedJobIDs(deltas []eipmongo.GroupMembershipDelta) []string {
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
