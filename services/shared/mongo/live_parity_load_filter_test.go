package mongo_test

import (
	"context"
	"fmt"
	"maps"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Live LoadJobsByFilter coverage via shared/mongo against real docs / scratch seeds.
// Requires EIP_MONGO_PARITY_LIVE=1.

func TestLive_LoadJobsByFilter_handlerShapes(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	samples := sampleLiveJobAccounts(t, ctx, mongo, 8)
	if len(samples) == 0 {
		t.Skip("no app-shaped user_job_documents (jobID field) to sample — throughput stubs skipped")
	}

	checked := 0
	for _, s := range samples {
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
			jobs, err := mongo.JobDocuments.LoadJobsByFilter(ctx, s.accountID, cloneFilter(fc.filter))
			if err != nil {
				t.Fatalf("account %s %s: %v", s.accountID, fc.label, err)
			}
			for _, j := range jobs {
				if j.JobID == "" {
					t.Fatalf("account %s %s: job missing jobID", s.accountID, fc.label)
				}
				if j.MetaData.AccountID != s.accountID {
					t.Fatalf("account %s %s: leaked account %q", s.accountID, fc.label, j.MetaData.AccountID)
				}
			}
			checked++
			t.Logf("ok handler-shape %s account=%s jobs=%d", fc.label, s.accountID, len(jobs))
		}
	}
	if checked == 0 {
		t.Fatal("no LoadJobsByFilter handler-shape loads ran")
	}
}

// LoadJobsByFilter merges accountID into the filter. Seeds scratch docs so identity is via jobID.
func TestLive_LoadJobsByFilter_accountScope(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	accountID := "eip-parity-scope-delta"
	otherAccount := "eip-parity-scope-delta-other"
	coll := mongo.JobDocuments.Collection()
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteMany(cctx, bson.M{"_meta.accountID": bson.M{"$in": []string{accountID, otherAccount}}})
	})
	_, _ = coll.DeleteMany(ctx, bson.M{"_meta.accountID": bson.M{"$in": []string{accountID, otherAccount}}})

	now := time.Now().UTC().Truncate(time.Millisecond)
	jobID := fmt.Sprintf("eip-parity-scope-delta-%d", now.UnixNano())
	otherJobID := fmt.Sprintf("eip-parity-scope-delta-other-%d", now.UnixNano())
	job := scopeScratchJob(jobID, accountID)
	other := scopeScratchJob(otherJobID, otherAccount)
	if _, failed, err := mongo.JobDocuments.BulkUpsertJobs(ctx, accountID, []models.Job{job}, now, "scope-delta", "scope-delta"); err != nil || failed != 0 {
		t.Fatalf("seed: failed=%d err=%v", failed, err)
	}
	if _, failed, err := mongo.JobDocuments.BulkUpsertJobs(ctx, otherAccount, []models.Job{other}, now, "scope-delta", "scope-delta"); err != nil || failed != 0 {
		t.Fatalf("seed other: failed=%d err=%v", failed, err)
	}

	// Filter omits account — only _id. Unique _id still finds the row; merge keeps account scope.
	idOnly := bson.M{"_id": bson.M{"$in": []string{jobID}}}
	gotID, err := mongo.JobDocuments.LoadJobsByFilter(ctx, accountID, cloneFilter(idOnly))
	if err != nil {
		t.Fatalf("id_only: %v", err)
	}
	if len(gotID) != 1 || gotID[0].JobID != jobID {
		t.Fatalf("id_only: got %v want only %s", jobIDsOf(gotID), jobID)
	}

	// Wrong account in filter, correct accountID param — merge forces accountID param.
	wrongAccountFilter := bson.M{
		"_meta.accountID": "eip-parity-wrong-account",
		"_id":             jobID,
	}
	gotWrong, err := mongo.JobDocuments.LoadJobsByFilter(ctx, accountID, cloneFilter(wrongAccountFilter))
	if err != nil {
		t.Fatalf("wrong_acct_filter: %v", err)
	}
	if len(gotWrong) != 1 || gotWrong[0].JobID != jobID {
		t.Fatalf("merge should force accountID param: got %d jobs (want job %s)", len(gotWrong), jobID)
	}

	// Broad filter without account — must stay on accountID (not otherAccount).
	broad := bson.M{"displayOnPlanner": true, "_id": bson.M{"$in": []string{jobID, otherJobID}}}
	gotBroad, err := mongo.JobDocuments.LoadJobsByFilter(ctx, accountID, cloneFilter(broad))
	if err != nil {
		t.Fatalf("planner_no_acct: %v", err)
	}
	for _, j := range gotBroad {
		if j.MetaData.AccountID != accountID {
			t.Fatalf("leaked account %q (want %q)", j.MetaData.AccountID, accountID)
		}
	}
	if len(gotBroad) != 1 || gotBroad[0].JobID != jobID {
		t.Fatalf("planner_no_acct: got %v want only %s", jobIDsOf(gotBroad), jobID)
	}
	t.Logf("accountScope: id_only + wrong-filter merge + broad filter all scoped to %s", accountID)
}

type liveJobAccountSample struct {
	accountID string
	jobIDs    []string
	groupID   string
}

func sampleLiveJobAccounts(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, maxAccounts int) []liveJobAccountSample {
	t.Helper()
	coll := mongo.JobDocuments.Collection()
	// Prefer app-shaped docs (jobID field). Throughput stubs only have _id/_meta and break JobID identity.
	cur, err := coll.Find(ctx, bson.M{"jobID": bson.M{"$type": "string", "$ne": ""}}, options.Find().SetLimit(80))
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
		if jobField, _ := raw["jobID"].(string); jobField != "" {
			jobID = jobField
		}
		if jobID == "" || accountID == "" || accountID == parityScratchAccount {
			continue
		}
		if strings.HasPrefix(accountID, "eip-parity-") {
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
	maps.Copy(out, in)
	return out
}

// Docs-layer slip: filter omits _meta.accountID. LoadJobsByFilter must still scope;
// the same Find without merge returns both accounts (what happens if we don't merge).
func TestLive_LoadJobsByFilter_docsLayerSlip(t *testing.T) {
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
