package mongo_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const transactionScratchCollection = "eip_parity_transactions"

func transactionScratch(t *testing.T) (*eipmongo.Mongo, *mongo.Collection, context.Context) {
	t.Helper()
	m := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)

	coll := m.Coll(transactionScratchCollection)
	_ = coll.Drop(ctx)
	t.Cleanup(func() { _ = coll.Drop(context.Background()) })
	if _, err := coll.InsertMany(ctx, []any{
		bson.M{"_id": "first", "value": 0},
		bson.M{"_id": "second", "value": 0},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return m, coll, ctx
}

func storedValue(t *testing.T, ctx context.Context, coll *mongo.Collection, id string) int32 {
	t.Helper()
	var doc struct {
		Value int32 `bson:"value"`
	}
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&doc); err != nil {
		t.Fatalf("read %s: %v", id, err)
	}
	return doc.Value
}

func setValue(ctx context.Context, coll *mongo.Collection, id string, value int32) error {
	_, err := coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"value": value}})
	return err
}

func TestLive_InTransaction_commitsEveryWriteWhenFnSucceeds(t *testing.T) {
	m, coll, ctx := transactionScratch(t)

	err := m.InTransaction(ctx, func(txCtx context.Context) error {
		if err := setValue(txCtx, coll, "first", 1); err != nil {
			return err
		}
		return setValue(txCtx, coll, "second", 2)
	})

	if err != nil {
		t.Fatalf("InTransaction: %v", err)
	}
	if storedValue(t, ctx, coll, "first") != 1 || storedValue(t, ctx, coll, "second") != 2 {
		t.Error("want both writes committed")
	}
}

func TestLive_InTransaction_writesNothingWhenFnRefusesPartWay(t *testing.T) {
	m, coll, ctx := transactionScratch(t)
	refused := errors.New("the second write is stale")

	err := m.InTransaction(ctx, func(txCtx context.Context) error {
		if err := setValue(txCtx, coll, "first", 1); err != nil {
			return err
		}
		return refused
	})

	if !errors.Is(err, refused) {
		t.Fatalf("err = %v, want the refusal fn returned", err)
	}
	if got := storedValue(t, ctx, coll, "first"); got != 0 {
		t.Errorf("first = %d, want the write made before the refusal undone", got)
	}
}

func TestLive_InTransaction_writesAreUnseenOutsideUntilCommitted(t *testing.T) {
	m, coll, ctx := transactionScratch(t)

	err := m.InTransaction(ctx, func(txCtx context.Context) error {
		if err := setValue(txCtx, coll, "first", 1); err != nil {
			return err
		}
		if outside := storedValue(t, ctx, coll, "first"); outside != 0 {
			t.Errorf("a read outside the transaction saw %d before the commit", outside)
		}
		return nil
	})

	if err != nil {
		t.Fatalf("InTransaction: %v", err)
	}
	if storedValue(t, ctx, coll, "first") != 1 {
		t.Error("want the write visible once committed")
	}
}

func TestLive_InTransaction_runsFnAgainWhenAnotherTransactionHeldTheDocument(t *testing.T) {
	m, coll, ctx := transactionScratch(t)

	var attempts atomic.Int32
	second := make(chan error, 1)

	err := m.InTransaction(ctx, func(holderCtx context.Context) error {
		if err := setValue(holderCtx, coll, "first", 1); err != nil {
			return err
		}
		go func() {
			second <- m.InTransaction(ctx, func(txCtx context.Context) error {
				attempts.Add(1)
				return setValue(txCtx, coll, "first", 2)
			})
		}()
		deadline := time.Now().Add(30 * time.Second)
		for attempts.Load() < 2 && time.Now().Before(deadline) {
			time.Sleep(10 * time.Millisecond)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("holding transaction: %v", err)
	}

	select {
	case err := <-second:
		if err != nil {
			t.Fatalf("retried transaction: %v", err)
		}
	case <-time.After(time.Minute):
		t.Fatal("the retried transaction never finished")
	}
	if attempts.Load() < 2 {
		t.Errorf("fn ran %d time(s), want it run again after the write conflict", attempts.Load())
	}
	if got := storedValue(t, ctx, coll, "first"); got != 2 {
		t.Errorf("first = %d, want the retried transaction's write", got)
	}
}

func TestLive_Retry_runsOnceInsideATransaction(t *testing.T) {
	m, _, ctx := transactionScratch(t)

	var calls int
	err := m.InTransaction(ctx, func(txCtx context.Context) error {
		return eipmongo.Retry(txCtx, "inside a transaction", func() error {
			calls++
			return mongo.ErrClientDisconnected
		})
	})

	if !errors.Is(err, mongo.ErrClientDisconnected) {
		t.Fatalf("err = %v, want the operation's own error", err)
	}
	if calls != 1 {
		t.Errorf("operation ran %d times, want once with retrying left to the transaction", calls)
	}
}
