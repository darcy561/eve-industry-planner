package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const roundtripScratchAccount = "eip-parity-account-roundtrip"

func TestLive_userAccountRoundtrip_writeIsReadableByItsPairedRead(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	accounts := mongo.Users.Collection()
	t.Cleanup(func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), 30*time.Second)
		defer done()
		_, _ = accounts.DeleteMany(cleanupCtx, bson.M{"_id": roundtripScratchAccount})
	})
	_, _ = accounts.DeleteMany(ctx, bson.M{"_id": roundtripScratchAccount})

	doc := models.UserAccountDocument{SchemaVersion: models.UserAccountDocumentSchemaCurrent}
	doc.MetaData.Owner = models.AccountOwner(roundtripScratchAccount)
	doc.HasCompletedFirstLoginFlow = true

	if _, _, err := mongo.Users.UpsertUserAccount(ctx, roundtripScratchAccount, doc); err != nil {
		t.Fatalf("UpsertUserAccount insert: %v", err)
	}

	got, err := mongo.LoadUserAccount(ctx, roundtripScratchAccount)
	if err != nil {
		t.Fatalf("LoadUserAccount after insert: %v", err)
	}
	if !got.HasCompletedFirstLoginFlow {
		t.Fatalf("inserted document came back without its state: %+v", got)
	}

	if _, _, err := mongo.Users.UpsertUserAccount(ctx, roundtripScratchAccount, doc); err != nil {
		t.Fatalf("UpsertUserAccount update: %v", err)
	}
	if _, err := mongo.LoadUserAccount(ctx, roundtripScratchAccount); err != nil {
		t.Fatalf("LoadUserAccount after update: %v", err)
	}
}

func TestLive_userAccountRoundtrip_recoversADocumentStoredWithoutAnOwner(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	accounts := mongo.Users.Collection()
	t.Cleanup(func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), 30*time.Second)
		defer done()
		_, _ = accounts.DeleteMany(cleanupCtx, bson.M{"_id": roundtripScratchAccount})
	})
	_, _ = accounts.DeleteMany(ctx, bson.M{"_id": roundtripScratchAccount})

	if _, err := accounts.InsertOne(ctx, bson.M{
		"_id":           roundtripScratchAccount,
		"schemaVersion": models.UserAccountDocumentSchemaCurrent,
		"_meta": bson.M{
			"accountID":    roundtripScratchAccount,
			"createdAt":    time.Now().UTC().Add(-time.Hour),
			"lastModified": time.Now().UTC().Add(-time.Hour),
		},
	}); err != nil {
		t.Fatalf("seed a legacy account document: %v", err)
	}

	if _, err := mongo.LoadUserAccount(ctx, roundtripScratchAccount); err == nil {
		t.Fatal("the seeded document should be unreachable until something writes its owner")
	}

	doc := models.UserAccountDocument{SchemaVersion: models.UserAccountDocumentSchemaCurrent}
	doc.MetaData.Owner = models.AccountOwner(roundtripScratchAccount)
	if _, _, err := mongo.Users.UpsertUserAccount(ctx, roundtripScratchAccount, doc); err != nil {
		t.Fatalf("UpsertUserAccount over a legacy document: %v", err)
	}

	if _, err := mongo.LoadUserAccount(ctx, roundtripScratchAccount); err != nil {
		t.Fatalf("a legacy document is still unreadable after being written: %v", err)
	}

	var stored bson.M
	if err := accounts.FindOne(ctx, bson.M{"_id": roundtripScratchAccount}).Decode(&stored); err != nil {
		t.Fatalf("read the stored document back: %v", err)
	}
	meta, _ := stored["_meta"].(bson.M)
	if meta == nil || meta["createdAt"] == nil {
		t.Fatalf("createdAt must survive the write, got %#v", stored["_meta"])
	}
}

func TestLive_scopedReadsFindWhatTheirWritesStore(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(roundtripScratchAccount)

	cases := []struct {
		name  string
		coll  *eipmongo.Docs
		write func() error
		read  func() error
	}{
		{
			name: "user account",
			coll: mongo.Users,
			write: func() error {
				doc := models.UserAccountDocument{SchemaVersion: models.UserAccountDocumentSchemaCurrent}
				doc.MetaData.Owner = owner
				_, _, err := mongo.Users.UpsertUserAccount(ctx, roundtripScratchAccount, doc)
				return err
			},
			read: func() error {
				_, err := mongo.LoadUserAccount(ctx, roundtripScratchAccount)
				return err
			},
		},
		{
			name: "application settings",
			coll: mongo.ApplicationSettings,
			write: func() error {
				settings := models.ApplicationSettings{}
				settings.MetaData.Owner = owner
				_, err := mongo.ApplicationSettings.UpsertStructPreservingMeta(
					ctx, settings, roundtripScratchAccount,
				)
				return err
			},
			read: func() error {
				_, err := mongo.LoadApplicationSettings(ctx, roundtripScratchAccount, time.Now().UTC())
				return err
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			collection := tc.coll.Collection()
			t.Cleanup(func() {
				cleanupCtx, done := context.WithTimeout(context.Background(), 30*time.Second)
				defer done()
				_, _ = collection.DeleteMany(cleanupCtx, bson.M{"_id": roundtripScratchAccount})
			})
			_, _ = collection.DeleteMany(ctx, bson.M{"_id": roundtripScratchAccount})

			if err := tc.write(); err != nil {
				t.Fatalf("write: %v", err)
			}
			if err := tc.read(); err != nil {
				t.Fatalf("read what the write stored: %v", err)
			}

			if err := tc.write(); err != nil {
				t.Fatalf("second write: %v", err)
			}
			if err := tc.read(); err != nil {
				t.Fatalf("read after the second write: %v", err)
			}
		})
	}
}
