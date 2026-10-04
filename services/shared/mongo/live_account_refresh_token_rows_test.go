package mongo_test

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const rowsTestAccountID = "scratch-refresh-token-rows"

func seedRefreshTokenRows(t *testing.T, m *eipmongo.Mongo, hashes ...string) {
	t.Helper()
	rows := make([]models.RefreshToken, 0, len(hashes))
	for _, hash := range hashes {
		rows = append(rows, models.RefreshToken{CharacterHash: hash, RToken: "seed-" + hash})
	}

	users := m.Users.Collection()
	clear := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, _ = users.DeleteMany(ctx, bson.M{"_id": rowsTestAccountID})
	}
	clear()
	t.Cleanup(clear)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := users.InsertOne(ctx, bson.M{
		"_id":               rowsTestAccountID,
		"_meta":             mongolive.OwnerMeta(models.AccountOwner(rowsTestAccountID)),
		"userCloudAccounts": true,
		"refreshTokens":     rows,
	}); err != nil {
		t.Fatalf("seed user document: %v", err)
	}
}

func storedRow(t *testing.T, m *eipmongo.Mongo, hash string) models.RefreshToken {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var doc models.UserAccountDocument
	if err := m.Users.Collection().FindOne(ctx, bson.M{"_id": rowsTestAccountID}).Decode(&doc); err != nil {
		t.Fatalf("read back user document: %v", err)
	}
	for _, row := range doc.RefreshTokens {
		if strings.EqualFold(row.CharacterHash, hash) {
			return row
		}
	}
	t.Fatalf("no row for %s", hash)
	return models.RefreshToken{}
}

func rowWith(hash, material string) models.RefreshToken {
	return models.RefreshToken{CharacterHash: hash, RToken: material}
}

func TestLiveConcurrentRefreshTokenRowWritesAllSurvive(t *testing.T) {
	m := mongolive.Require(t)
	seedRefreshTokenRows(t, m, "a", "b", "c")

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	var start sync.WaitGroup
	start.Add(1)
	var done sync.WaitGroup
	errs := make([]error, 2)

	done.Go(func() {
		start.Wait()
		errs[0] = m.Users.PatchUserRefreshTokenRows(ctx, rowsTestAccountID,
			[]models.RefreshToken{rowWith("a", "bulk-a"), rowWith("b", "bulk-b")})
	})
	done.Go(func() {
		start.Wait()
		errs[1] = m.Users.PatchUserRefreshTokenRows(ctx, rowsTestAccountID, []models.RefreshToken{rowWith("c", "single-c")})
	})
	start.Done()
	done.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("writer %d: %v", i, err)
		}
	}

	for hash, want := range map[string]string{"a": "bulk-a", "b": "bulk-b", "c": "single-c"} {
		if got := storedRow(t, m, hash).RToken; got != want {
			t.Errorf("row %s = %q, want %q — a writer carried a stale copy of a row it was not given",
				hash, got, want)
		}
	}
}

func TestLiveWholeArrayWriteLosesAConcurrentRotation(t *testing.T) {
	m := mongolive.Require(t)
	seedRefreshTokenRows(t, m, "a", "b", "c")

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	var snapshot models.UserAccountDocument
	if err := m.Users.Collection().
		FindOne(ctx, bson.M{"_id": rowsTestAccountID}).Decode(&snapshot); err != nil {
		t.Fatalf("read snapshot: %v", err)
	}

	if err := m.Users.PatchUserRefreshTokenRows(ctx, rowsTestAccountID, []models.RefreshToken{rowWith("c", "single-c")}); err != nil {
		t.Fatalf("single-row write: %v", err)
	}

	for i := range snapshot.RefreshTokens {
		if snapshot.RefreshTokens[i].CharacterHash == "a" {
			snapshot.RefreshTokens[i].RToken = "bulk-a"
		}
	}
	if _, err := m.Users.Collection().UpdateOne(ctx,
		bson.M{"_id": rowsTestAccountID},
		bson.M{"$set": bson.M{"refreshTokens": snapshot.RefreshTokens}},
	); err != nil {
		t.Fatalf("whole-array write: %v", err)
	}

	if got := storedRow(t, m, "c").RToken; got != "seed-c" {
		t.Fatalf("expected the whole-array write to have reverted c to %q, got %q — if this now "+
			"survives, the array write is no longer the hazard the row-scoped helpers guard against",
			"seed-c", got)
	}
}

func TestLiveBulkWriteLeavesUnlistedRowsAlone(t *testing.T) {
	m := mongolive.Require(t)
	seedRefreshTokenRows(t, m, "a", "b", "c")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := m.Users.PatchUserRefreshTokenRows(ctx, rowsTestAccountID, []models.RefreshToken{rowWith("c", "rotated-c")}); err != nil {
		t.Fatalf("single-row write: %v", err)
	}
	if err := m.Users.PatchUserRefreshTokenRows(ctx, rowsTestAccountID,
		[]models.RefreshToken{rowWith("a", "bulk-a")}); err != nil {
		t.Fatalf("bulk write: %v", err)
	}

	if got := storedRow(t, m, "c").RToken; got != "rotated-c" {
		t.Errorf("row c = %q, want %q — the bulk write touched a row it was not given", got, "rotated-c")
	}
	if got := storedRow(t, m, "b").RToken; got != "seed-b" {
		t.Errorf("row b = %q, want it untouched", got)
	}
}

func TestLivePatchRefreshTokenRowRejectsAnUnknownCharacter(t *testing.T) {
	m := mongolive.Require(t)
	seedRefreshTokenRows(t, m, "a")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err := m.Users.PatchUserRefreshTokenRows(ctx, rowsTestAccountID, []models.RefreshToken{rowWith("not-linked", "x")})
	if err == nil {
		t.Fatal("patching a row that does not exist reported success")
	}
	if !strings.Contains(err.Error(), "matched no row") {
		t.Fatalf("error = %v, want it to name the unmatched row", err)
	}
}

func TestLivePushRefreshTokenRowAddsThenReplaces(t *testing.T) {
	m := mongolive.Require(t)
	seedRefreshTokenRows(t, m, "a")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := m.Users.PushUserRefreshTokenRow(ctx, rowsTestAccountID, rowWith("b", "added-b")); err != nil {
		t.Fatalf("push new row: %v", err)
	}
	if got := storedRow(t, m, "b").RToken; got != "added-b" {
		t.Fatalf("row b = %q, want the pushed value", got)
	}

	if err := m.Users.PushUserRefreshTokenRow(ctx, rowsTestAccountID, rowWith("b", "replaced-b")); err != nil {
		t.Fatalf("push existing row: %v", err)
	}
	if got := storedRow(t, m, "b").RToken; got != "replaced-b" {
		t.Fatalf("row b = %q, want the replacement", got)
	}

	var doc models.UserAccountDocument
	if err := m.Users.Collection().
		FindOne(ctx, bson.M{"_id": rowsTestAccountID}).Decode(&doc); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if len(doc.RefreshTokens) != 2 {
		t.Fatalf("rows = %d, want 2 — replacing a row must not add a duplicate", len(doc.RefreshTokens))
	}
	if got := storedRow(t, m, "a").RToken; got != "seed-a" {
		t.Fatalf("row a = %q, want it untouched by writes to b", got)
	}
}

func TestLivePullRefreshTokenRowsRemovesOnlyTheNamed(t *testing.T) {
	m := mongolive.Require(t)
	seedRefreshTokenRows(t, m, "a", "b", "c")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := m.Users.PullUserRefreshTokenRows(ctx, rowsTestAccountID, []string{"b"}); err != nil {
		t.Fatalf("pull: %v", err)
	}

	var doc models.UserAccountDocument
	if err := m.Users.Collection().
		FindOne(ctx, bson.M{"_id": rowsTestAccountID}).Decode(&doc); err != nil {
		t.Fatalf("read back: %v", err)
	}
	got := make([]string, 0, len(doc.RefreshTokens))
	for _, row := range doc.RefreshTokens {
		got = append(got, row.CharacterHash)
	}
	if fmt.Sprint(got) != "[a c]" {
		t.Fatalf("rows = %v, want [a c]", got)
	}
}
