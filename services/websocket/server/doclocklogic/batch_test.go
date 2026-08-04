package doclocklogic

import (
	"context"
	"testing"

	"eve-industry-planner/shared/core/documentlock"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestRunLockStateBatchNilRedis(t *testing.T) {
	t.Parallel()
	res := RunLockStateBatch(context.Background(), nil, "acct", LockStateBatchRequest{
		RequestID: "r1",
		JobDocIDs: []string{"j1"},
	})
	if res.OK() || res.FailureClass != documentlock.FailureUnavailable || res.AckOK {
		t.Fatalf("got %+v", res)
	}
}

func TestRunLockStateBatchEmptyAndOK(t *testing.T) {
	t.Parallel()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	empty := RunLockStateBatch(context.Background(), rdb, "acct", LockStateBatchRequest{RequestID: "r1"})
	if empty.FailureClass != documentlock.FailureStateBatchEmpty || empty.AckErrMsg != documentlock.ErrStatusBatchEmpty.Error() {
		t.Fatalf("empty: %+v", empty)
	}

	ok := RunLockStateBatch(context.Background(), rdb, "acct", LockStateBatchRequest{
		RequestID: "r2",
		JobDocIDs: []string{"job-1"},
	})
	if !ok.OK() || !ok.AckOK || ok.JobResults == nil {
		t.Fatalf("ok batch: %+v", ok)
	}

	tooMany := make([]string, documentlock.MaxStatusBatchDocs+1)
	for i := range tooMany {
		tooMany[i] = "x"
	}
	many := RunLockStateBatch(context.Background(), rdb, "acct", LockStateBatchRequest{
		RequestID: "r3",
		JobDocIDs: tooMany,
	})
	if many.FailureClass != documentlock.FailureStateBatchTooMany || many.AckErrMsg != documentlock.ErrStatusBatchTooMany.Error() {
		t.Fatalf("too many: %+v", many)
	}
}
