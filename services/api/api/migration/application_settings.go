package migration

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/core/firebaseuserdoc"
	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.mongodb.org/mongo-driver/mongo"
)

const (
	usersCollection = "Users"
)

// GetApplicationSettingsFromFirebase loads the main user document (which includes application settings)
// from Firebase for the given accountID and returns it as a generic map.
func GetApplicationSettingsFromFirebase(ctx context.Context, accountID string) (map[string]interface{}, error) {
	if accountID == "" {
		return nil, fmt.Errorf("accountID is required")
	}

	client, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("get firestore client: %w", err)
	}

	docRef := client.Collection(usersCollection).Doc(accountID)

	snap, err := docRef.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("get user document from firestore: %w", err)
	}

	if !snap.Exists() {
		return nil, nil
	}

	data := snap.Data()
	return data, nil
}

// EnqueueMigrateUserDocumentToMongo publishes a low-priority task to migrate the Firebase user document
// for the given accountID to MongoDB (split into account document + application settings document).
// The worker fetches the user document from Firestore. No-op if js is nil or accountID is empty.
// Logs and returns on publish error; does not fail the caller.
func EnqueueMigrateUserDocumentToMongo(ctx context.Context, js jetstream.JetStream, accountID string, natsConn *natslib.Conn) {
	if js == nil || accountID == "" {
		return
	}
	payload := natscore.MigrateUserDocumentToMongoRequest{
		AccountID: accountID,
	}
	if err := natscore.PublishTask(js, taskscore.MigrateUserDocumentToMongo.Subject, taskscore.MigrateUserDocumentToMongo.Name, payload, natsConn); err != nil {
		logs.WarnCtx(ctx, "failed to enqueue migrate user document to mongo task", "account_id", accountID, "error", err)
		return
	}
	logs.DebugCtx(ctx, "enqueued migrate user document to mongo task", "account_id", accountID)
}

// SaveApplicationSettingsToFirebase saves the full user document (Firebase form) to Firestore Users/{accountID}.
func SaveApplicationSettingsToFirebase(ctx context.Context, accountID string, doc map[string]interface{}) error {
	if accountID == "" {
		return fmt.Errorf("accountID is required")
	}
	if len(doc) == 0 {
		return fmt.Errorf("document cannot be empty")
	}
	client, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("get firestore client: %w", err)
	}
	docRef := client.Collection(usersCollection).Doc(accountID)
	_, err = docRef.Set(ctx, doc)
	if err != nil {
		return fmt.Errorf("set user document in firestore: %w", err)
	}
	return nil
}

// TrySaveApplicationSettingsToMongo splits the Firebase user document into account doc + application settings,
// then upserts both into MongoDB (users and application_settings). Logs and returns on error; does not fail the caller.
func TrySaveApplicationSettingsToMongo(ctx context.Context, mongoClient *mongo.Client, accountID string, doc map[string]interface{}) {
	if mongoClient == nil || accountID == "" || len(doc) == 0 {
		return
	}
	fb, err := firebaseuserdoc.ParseUserDoc(doc)
	if err != nil {
		logs.WarnCtx(ctx, "failed to parse firebase doc for mongo migration", "account_id", accountID, "error", err)
		return
	}
	if fb == nil {
		return
	}
	accountDoc := firebaseuserdoc.MapUserAccountForSync(fb, accountID)
	settingsDoc := firebaseuserdoc.MapApplicationSettings(fb, accountID)

	db := mongoClient.Database(mongocore.DatabaseName)
	usersCol := db.Collection(mongocore.CollectionUsers)
	settingsCol := db.Collection(mongocore.CollectionApplicationSettings)

	// Upsert account document while preserving metadata fields from initial import.
	_, err = mongocore.UpsertStructByIDPreservingMeta(ctx, usersCol, accountDoc, accountID)
	if err != nil {
		logs.WarnCtx(ctx, "failed to save user account document in mongo", "account_id", accountID, "error", err)
		return
	}

	_, err = mongocore.UpsertStructByIDPreservingMeta(ctx, settingsCol, settingsDoc, accountID)
	if err != nil {
		logs.WarnCtx(ctx, "failed to upsert application settings to mongo", "account_id", accountID, "error", err)
		return
	}
	logs.DebugCtx(ctx, "upserted user account and application settings to mongo", "account_id", accountID)
}
