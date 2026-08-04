package mongo_test

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	mongoget "eve-industry-planner/shared/core/mongo/get"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Live dual-path LoadJobsByFilter: oracle mongoget vs shared/mongo against real docs.
// Requires EIP_MONGO_PARITY_LIVE=1.

func TestParity_live_LoadJobsByFilter_handlerShapes(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	samples := sampleLiveJobAccounts(t, ctx, mongo, 8)
	if len(samples) == 0 {
		t.Skip("no user_job_documents with _id + _meta.accountID to sample")
	}

	checked := 0
	for _, s := range samples {
		coll := mongo.JobDocuments.Collection()

		// Same shapes as jobdocuments getHandlers (account already in filter).
		filters := []struct {
			label  string
			filter bson.M
		}{
			{"planner", bson.M{"_meta.accountID": s.accountID, "displayOnPlanner": true}},
			{"by_ids", bson.M{"_meta.accountID": s.accountID, "_id": bson.M{"$in": s.jobIDs}}},
		}
		if s.groupID != "" {
			filters = append(filters, struct {
				label  string
				filter bson.M
			}{"by_group", bson.M{"_meta.accountID": s.accountID, "groupID": s.groupID}})
		}

		for _, fc := range filters {
			legacyJobs, errL := mongoget.LoadJobsByFilter(ctx, coll, s.accountID, fc.label, cloneFilter(fc.filter))
			newJobs, errN := mongo.JobDocuments.LoadJobsByFilter(ctx, s.accountID, cloneFilter(fc.filter))
			if (errL == nil) != (errN == nil) {
				t.Fatalf("account %s %s err new=%v legacy=%v", s.accountID, fc.label, errN, errL)
			}
			if errN != nil {
				t.Fatalf("account %s %s: %v", s.accountID, fc.label, errN)
			}
			assertJobListParity(t, s.accountID+"/"+fc.label, legacyJobs, newJobs)
			checked++
			t.Logf("ok handler-shape %s account=%s jobs=%d", fc.label, s.accountID, len(newJobs))
		}
	}
	if checked == 0 {
		t.Fatal("no LoadJobsByFilter handler-shape compares ran")
	}
}

// Documents the intentional account-scope delta: new merges accountID into the filter;
// oracle does not. Handler-shaped calls already include accountID so they stay equal.
func TestParity_live_LoadJobsByFilter_accountScopeDelta(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	samples := sampleLiveJobAccounts(t, ctx, mongo, 3)
	if len(samples) == 0 {
		t.Skip("no user_job_documents to sample")
	}
	s := samples[0]
	coll := mongo.JobDocuments.Collection()
	jobID := s.jobIDs[0]

	// Filter omits account — only _id. Both should still find the same row (_id is unique).
	idOnly := bson.M{"_id": bson.M{"$in": []string{jobID}}}
	legacyID, errL := mongoget.LoadJobsByFilter(ctx, coll, s.accountID, "id_only", cloneFilter(idOnly))
	newID, errN := mongo.JobDocuments.LoadJobsByFilter(ctx, s.accountID, cloneFilter(idOnly))
	if errL != nil || errN != nil {
		t.Fatalf("id_only err new=%v legacy=%v", errN, errL)
	}
	assertJobListParity(t, "id_only", legacyID, newID)
	t.Logf("id_only: both returned %d job(s) (unique _id)", len(newID))

	// Wrong account in filter, correct accountID param.
	wrongAccountFilter := bson.M{
		"_meta.accountID": "eip-parity-wrong-account",
		"_id":             jobID,
	}
	legacyWrong, errL := mongoget.LoadJobsByFilter(ctx, coll, s.accountID, "wrong_acct_filter", cloneFilter(wrongAccountFilter))
	newWrong, errN := mongo.JobDocuments.LoadJobsByFilter(ctx, s.accountID, cloneFilter(wrongAccountFilter))
	if errL != nil || errN != nil {
		t.Fatalf("wrong_acct_filter err new=%v legacy=%v", errN, errL)
	}
	if len(legacyWrong) != 0 {
		t.Fatalf("oracle with wrong account in filter: expected 0 jobs, got %d", len(legacyWrong))
	}
	if len(newWrong) != 1 || newWrong[0].JobID != jobID {
		t.Fatalf("new merge should force accountID param: got %d jobs (want job %s)", len(newWrong), jobID)
	}
	t.Logf("accountScopeDelta: oracle empty with wrong filter account; new returned job via merged accountID=%s", s.accountID)

	// Broad filter without account (displayOnPlanner only) — oracle can see other accounts;
	// new must stay on s.accountID.
	broad := bson.M{"displayOnPlanner": true}
	legacyBroad, errL := mongoget.LoadJobsByFilter(ctx, coll, s.accountID, "planner_no_acct", cloneFilter(broad))
	newBroad, errN := mongo.JobDocuments.LoadJobsByFilter(ctx, s.accountID, cloneFilter(broad))
	if errL != nil || errN != nil {
		t.Fatalf("planner_no_acct err new=%v legacy=%v", errN, errL)
	}
	for _, j := range newBroad {
		if j.MetaData.AccountID != s.accountID {
			t.Fatalf("new leaked account %q (want %q)", j.MetaData.AccountID, s.accountID)
		}
	}
	otherAccounts := 0
	for _, j := range legacyBroad {
		if j.MetaData.AccountID != s.accountID {
			otherAccounts++
		}
	}
	t.Logf("planner_no_acct: new=%d (scoped) oracle=%d (otherAccounts=%d)", len(newBroad), len(legacyBroad), otherAccounts)
	if otherAccounts == 0 && len(legacyBroad) != len(newBroad) {
		// Same account universe only — lengths should still match if no other accounts exist.
		assertJobListParity(t, "planner_no_acct_same_universe", legacyBroad, newBroad)
	}
	if otherAccounts > 0 && len(legacyBroad) <= len(newBroad) {
		t.Fatalf("expected oracle broader than new when other accounts present: oracle=%d new=%d", len(legacyBroad), len(newBroad))
	}
}

type liveJobAccountSample struct {
	accountID string
	jobIDs    []string
	groupID   string
}

func sampleLiveJobAccounts(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, maxAccounts int) []liveJobAccountSample {
	t.Helper()
	coll := mongo.JobDocuments.Collection()
	cur, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(80))
	if err != nil {
		t.Fatalf("sample find: %v", err)
	}
	defer cur.Close(ctx)

	byAccount := map[string]*liveJobAccountSample{}
	order := make([]string, 0)
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			t.Fatalf("decode: %v", err)
		}
		jobID, accountID := docIDAndAccount(raw)
		if jobID == "" || accountID == "" || accountID == parityScratchAccount {
			continue
		}
		s, ok := byAccount[accountID]
		if !ok {
			if len(order) >= maxAccounts {
				continue
			}
			s = &liveJobAccountSample{accountID: accountID}
			byAccount[accountID] = s
			order = append(order, accountID)
		}
		if len(s.jobIDs) < 5 {
			s.jobIDs = append(s.jobIDs, jobID)
		}
		if s.groupID == "" {
			if gid, _ := raw["groupID"].(string); gid != "" {
				s.groupID = gid
			}
		}
	}
	out := make([]liveJobAccountSample, 0, len(order))
	for _, id := range order {
		out = append(out, *byAccount[id])
	}
	return out
}

func cloneFilter(in bson.M) bson.M {
	out := make(bson.M, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

// Docs-layer slip: filter omits _meta.accountID. LoadJobsByFilter must still scope;
// the same Find without merge returns both accounts (what happens if we don't merge).
func TestParity_live_LoadJobsByFilter_docsLayerSlip(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	accountA := "eip-parity-scope-a"
	accountB := "eip-parity-scope-b"
	coll := mongo.JobDocuments.Collection()
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteMany(cctx, bson.M{"_meta.accountID": bson.M{"$in": []string{accountA, accountB}}})
	})
	_, _ = coll.DeleteMany(ctx, bson.M{"_meta.accountID": bson.M{"$in": []string{accountA, accountB}}})

	now := time.Now().UTC().Truncate(time.Millisecond)
	jobA := scopeScratchJob(fmt.Sprintf("eip-parity-scope-a-%d", now.UnixNano()), accountA)
	jobB := scopeScratchJob(fmt.Sprintf("eip-parity-scope-b-%d", now.UnixNano()), accountB)
	if _, failed, err := mongo.JobDocuments.BulkUpsertJobs(ctx, accountA, []models.Job{jobA}, now, "scope-sess", "scope-client"); err != nil || failed != 0 {
		t.Fatalf("seed A: failed=%d err=%v", failed, err)
	}
	if _, failed, err := mongo.JobDocuments.BulkUpsertJobs(ctx, accountB, []models.Job{jobB}, now, "scope-sess", "scope-client"); err != nil || failed != 0 {
		t.Fatalf("seed B: failed=%d err=%v", failed, err)
	}

	// Caller "forgets" account in filter (planner-shaped predicate only).
	filterNoAccount := bson.M{
		"displayOnPlanner": true,
		"_id":              bson.M{"$in": []string{jobA.JobID, jobB.JobID}},
	}

	// Without merge: same Find the Docs layer would run if it trusted the filter alone.
	var slipped []models.Job
	cur, err := coll.Find(ctx, filterNoAccount, options.Find().SetSort(bson.M{"_meta.lastModified": -1}))
	if err != nil {
		t.Fatalf("raw find (no merge): %v", err)
	}
	if err := cur.All(ctx, &slipped); err != nil {
		t.Fatalf("raw find decode: %v", err)
	}
	_ = cur.Close(ctx)
	if len(slipped) != 2 {
		t.Fatalf("without merge expected both accounts' jobs, got %d", len(slipped))
	}
	t.Logf("without merge: Find returned %d jobs (accounts leaked across A+B)", len(slipped))

	// With Docs merge: only account A.
	scoped, err := mongo.JobDocuments.LoadJobsByFilter(ctx, accountA, filterNoAccount)
	if err != nil {
		t.Fatalf("LoadJobsByFilter: %v", err)
	}
	if len(scoped) != 1 || scoped[0].JobID != jobA.JobID {
		t.Fatalf("with merge: got %+v want only %s", jobIDsOf(scoped), jobA.JobID)
	}
	if scoped[0].MetaData.AccountID != accountA {
		t.Fatalf("with merge: accountID=%q", scoped[0].MetaData.AccountID)
	}
	t.Logf("with merge: LoadJobsByFilter(accountA) returned only %s", jobA.JobID)
}

func scopeScratchJob(jobID, accountID string) models.Job {
	return models.Job{
		JobID:            jobID,
		Name:             "eip-parity-scope",
		ItemID:           34,
		DisplayOnPlanner: true,
		APIJobs:          []int{},
		APIOrders:        []int{},
		APITransactions:  []int{},
		ParentJobs:       []string{},
		Build: models.JobBuild{
			Setup:     map[string]models.JobSetup{},
			ChildJobs: map[string][]string{},
			Materials: []models.JobMaterial{},
		},
		Skills: []models.Skill{},
		MetaData: models.JobMetaData{
			MetaData: models.MetaData{AccountID: accountID},
		},
	}
}

func jobIDsOf(jobs []models.Job) []string {
	out := make([]string, len(jobs))
	for i, j := range jobs {
		out[i] = j.JobID
	}
	return out
}

func assertJobListParity(t *testing.T, label string, legacyJobs, newJobs []models.Job) {
	t.Helper()
	if len(legacyJobs) != len(newJobs) {
		t.Fatalf("%s len new=%d legacy=%d", label, len(newJobs), len(legacyJobs))
	}
	byID := make(map[string]models.Job, len(legacyJobs))
	for _, j := range legacyJobs {
		byID[j.JobID] = j
	}
	for _, j := range newJobs {
		want, ok := byID[j.JobID]
		if !ok {
			t.Fatalf("%s missing job %s in oracle result", label, j.JobID)
		}
		if !reflect.DeepEqual(want, j) {
			t.Fatalf("%s job %s content mismatch", label, j.JobID)
		}
	}
}
