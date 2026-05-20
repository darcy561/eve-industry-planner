package documentlock

import (
	"context"
	"encoding/json"
	"strconv"
	"testing"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"

	"github.com/redis/go-redis/v9"
)

func seedLock(t *testing.T, rdb *redis.Client, accountID, collection, docID string, rec LockRecord) {
	t.Helper()
	b, err := json.Marshal(rec)
	if err != nil {
		t.Fatalf("marshal lock: %v", err)
	}
	if err := rdb.Set(context.Background(), LockKey(accountID, collection, docID), b, DefaultLockTTL).Err(); err != nil {
		t.Fatalf("seed lock: %v", err)
	}
}

func TestStatusBatchFetch_AllUnheld(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	refs := []statusDocRef{
		{Collection: mongocore.CollectionUserJobDocuments, DocID: "job-a"},
		{Collection: mongocore.CollectionUserJobDocuments, DocID: "job-b"},
	}
	results, err := statusBatchFetch(ctx, rdb, testAccountID, refs)
	if err != nil {
		t.Fatalf("statusBatchFetch: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for i, p := range results {
		if held, _ := p["held"].(bool); held {
			t.Fatalf("[%d] expected held=false, got %v", i, p)
		}
		if vc, ok := p["viewerCount"].(int64); !ok || vc != 0 {
			t.Fatalf("[%d] expected viewerCount=0, got %v", i, p["viewerCount"])
		}
		if _, has := p["waitlistLen"]; has {
			t.Fatalf("[%d] unheld payload should not include waitlistLen, got %v", i, p)
		}
	}
}

func TestStatusBatchFetch_HeldWithViewersAndWaitlist(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	docID := "doc-held"
	rec := LockRecord{
		HolderSessionID: "sess-holder",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
		ExtendCount:     2,
	}
	seedLock(t, rdb, testAccountID, testCollection, docID, rec)

	// Two live viewers + one expired viewer (score in the past).
	if _, err := AddViewer(ctx, rdb, testAccountID, testCollection, docID, "viewer-a"); err != nil {
		t.Fatalf("AddViewer a: %v", err)
	}
	if _, err := AddViewer(ctx, rdb, testAccountID, testCollection, docID, "viewer-b"); err != nil {
		t.Fatalf("AddViewer b: %v", err)
	}
	if err := rdb.ZAddArgs(ctx, viewerPresenceKey(testAccountID, testCollection, docID), redis.ZAddArgs{
		Members: []redis.Z{{Score: float64(time.Now().Add(-time.Hour).Unix()), Member: "viewer-stale"}},
	}).Err(); err != nil {
		t.Fatalf("seed stale viewer: %v", err)
	}

	// Two waitlist entries (LLen counts raw entries).
	if err := EnqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, docID, "wait-a"); err != nil {
		t.Fatalf("enqueue wait-a: %v", err)
	}
	if err := EnqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, docID, "wait-b"); err != nil {
		t.Fatalf("enqueue wait-b: %v", err)
	}

	results, err := statusBatchFetch(ctx, rdb, testAccountID, []statusDocRef{
		{Collection: testCollection, DocID: docID},
	})
	if err != nil {
		t.Fatalf("statusBatchFetch: %v", err)
	}
	p := results[0]
	if held, _ := p["held"].(bool); !held {
		t.Fatalf("expected held=true, got %v", p)
	}
	if got, _ := p["holderSessionID"].(string); got != "sess-holder" {
		t.Fatalf("holderSessionID: got %q", got)
	}
	if got, _ := p["extendCount"].(int); got != 2 {
		t.Fatalf("extendCount: got %v", p["extendCount"])
	}
	if wl, _ := p["waitlistLen"].(int64); wl != 2 {
		t.Fatalf("waitlistLen: got %v", p["waitlistLen"])
	}
	if vc, _ := p["viewerCount"].(int64); vc != 2 {
		t.Fatalf("viewerCount: got %v (expected 2 live after pruning stale)", p["viewerCount"])
	}
	if got, _ := p["expiresAtUnix"].(int64); got != rec.ExpiresAtUnix {
		t.Fatalf("expiresAtUnix: got %v want %v", got, rec.ExpiresAtUnix)
	}
}

func TestStatusBatchFetch_ExpiredRecordReturnsUnheldAndDeletes(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	docID := "doc-expired"
	rec := LockRecord{
		HolderSessionID: "sess-holder",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(-time.Minute).Unix(),
	}
	// Bypass DefaultLockTTL here so miniredis still has the key for us to
	// observe the expired-record cleanup path inside statusBatchFetch.
	b, _ := json.Marshal(rec)
	if err := rdb.Set(ctx, LockKey(testAccountID, testCollection, docID), b, 0).Err(); err != nil {
		t.Fatalf("seed expired: %v", err)
	}

	results, err := statusBatchFetch(ctx, rdb, testAccountID, []statusDocRef{
		{Collection: testCollection, DocID: docID},
	})
	if err != nil {
		t.Fatalf("statusBatchFetch: %v", err)
	}
	if held, _ := results[0]["held"].(bool); held {
		t.Fatalf("expected held=false for expired record, got %v", results[0])
	}

	// The follow-up DEL pipeline should have removed the key.
	if n, err := rdb.Exists(ctx, LockKey(testAccountID, testCollection, docID)).Result(); err != nil {
		t.Fatalf("Exists: %v", err)
	} else if n != 0 {
		t.Fatalf("expected expired key to be DELed, still exists")
	}
}

func TestStatusBatchFetch_EmptyRefs(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	results, err := statusBatchFetch(ctx, rdb, testAccountID, nil)
	if err != nil {
		t.Fatalf("statusBatchFetch nil: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected zero results, got %d", len(results))
	}
}

func TestStatusBatchFetch_PreservesInputOrder(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	refs := []statusDocRef{
		{Collection: testCollection, DocID: "doc-1"},
		{Collection: testCollection, DocID: "doc-2-held"},
		{Collection: testCollection, DocID: "doc-3"},
	}
	seedLock(t, rdb, testAccountID, testCollection, "doc-2-held", LockRecord{
		HolderSessionID: "sess-middle",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})

	results, err := statusBatchFetch(ctx, rdb, testAccountID, refs)
	if err != nil {
		t.Fatalf("statusBatchFetch: %v", err)
	}
	if held, _ := results[0]["held"].(bool); held {
		t.Fatalf("[0] expected held=false")
	}
	if held, _ := results[1]["held"].(bool); !held {
		t.Fatalf("[1] expected held=true")
	}
	if held, _ := results[2]["held"].(bool); held {
		t.Fatalf("[2] expected held=false")
	}
}

func TestStatusBatchResults_EmptyError(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	if _, _, err := StatusBatchResults(context.Background(), rdb, testAccountID, nil, nil); err != ErrStatusBatchEmpty {
		t.Fatalf("expected ErrStatusBatchEmpty, got %v", err)
	}
}

func TestStatusBatchResults_TooManyError(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	tooMany := make([]string, MaxStatusBatchDocs+1)
	for i := range tooMany {
		tooMany[i] = "id-" + strconv.Itoa(i)
	}
	if _, _, err := StatusBatchResults(context.Background(), rdb, testAccountID, tooMany, nil); err != ErrStatusBatchTooMany {
		t.Fatalf("expected ErrStatusBatchTooMany, got %v", err)
	}
}

func TestStatusBatchResults_NilRedisError(t *testing.T) {
	t.Parallel()
	if _, _, err := StatusBatchResults(context.Background(), nil, testAccountID, []string{"a"}, nil); err != ErrLocksUnavailable {
		t.Fatalf("expected ErrLocksUnavailable, got %v", err)
	}
}

func TestStatusBatchResults_RoutesJobsAndGroupsIntoSeparateBuckets(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	jobID := "job-x"
	groupID := "group-x"

	seedLock(t, rdb, testAccountID, mongocore.CollectionUserJobDocuments, jobID, LockRecord{
		HolderSessionID: "sess-job",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})
	seedLock(t, rdb, testAccountID, mongocore.CollectionUserJobGroups, groupID, LockRecord{
		HolderSessionID: "sess-group",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})

	jobs, groups, err := StatusBatchResults(ctx, rdb, testAccountID, []string{jobID, "missing-job"}, []string{groupID, "", "missing-group"})
	if err != nil {
		t.Fatalf("StatusBatchResults: %v", err)
	}

	if _, ok := jobs[jobID]; !ok {
		t.Fatalf("job %q missing from jobs map", jobID)
	}
	if got, _ := jobs[jobID].(map[string]any)["holderSessionID"].(string); got != "sess-job" {
		t.Fatalf("job holderSessionID: got %q", got)
	}
	if _, ok := jobs["missing-job"]; !ok {
		t.Fatalf("missing-job should still occupy a slot with held=false")
	}

	if _, ok := groups[groupID]; !ok {
		t.Fatalf("group %q missing from groups map", groupID)
	}
	if got, _ := groups[groupID].(map[string]any)["holderSessionID"].(string); got != "sess-group" {
		t.Fatalf("group holderSessionID: got %q", got)
	}
	if _, ok := groups[""]; ok {
		t.Fatalf("blank doc IDs must be skipped, not occupy a slot")
	}
	if _, ok := groups["missing-group"]; !ok {
		t.Fatalf("missing-group should still occupy a slot with held=false")
	}
}

func TestStatusPayloadForDoc_MatchesBatchPath(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	docID := "doc-equiv"
	rec := LockRecord{
		HolderSessionID: "sess-equiv",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
		ExtendCount:     1,
	}
	seedLock(t, rdb, testAccountID, testCollection, docID, rec)

	single, err := StatusPayloadForDoc(ctx, rdb, testAccountID, testCollection, docID)
	if err != nil {
		t.Fatalf("StatusPayloadForDoc: %v", err)
	}
	batch, err := statusBatchFetch(ctx, rdb, testAccountID, []statusDocRef{
		{Collection: testCollection, DocID: docID},
	})
	if err != nil {
		t.Fatalf("statusBatchFetch: %v", err)
	}
	if got, want := single["holderSessionID"], batch[0]["holderSessionID"]; got != want {
		t.Fatalf("holderSessionID mismatch: %v vs %v", got, want)
	}
	if got, want := single["held"], batch[0]["held"]; got != want {
		t.Fatalf("held mismatch: %v vs %v", got, want)
	}
}
