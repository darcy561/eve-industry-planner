package mongo

import (
	"testing"

	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestNewMongo_nilClient(t *testing.T) {
	t.Parallel()
	_, err := NewMongo(nil)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestNewMongo_andColl(t *testing.T) {
	t.Parallel()
	client, err := mongodriver.Connect(options.Client().ApplyURI("mongodb://127.0.0.1:27017"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(t.Context()) })

	mongo, err := NewMongo(client)
	if err != nil {
		t.Fatal(err)
	}
	if mongo.DB == nil || mongo.DB.Name() != DatabaseName {
		t.Fatalf("DB=%v want name %q", mongo.DB, DatabaseName)
	}
	docs := mongo.BuildStats
	if docs == nil || docs.Collection() == nil || docs.Collection().Name() != CollectionBuildStats {
		t.Fatalf("BuildStats=%v", docs)
	}
	if docs.Collection().Database().Name() != DatabaseName {
		t.Fatalf("coll db=%q", docs.Collection().Database().Name())
	}
}
