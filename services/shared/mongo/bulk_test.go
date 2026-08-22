package mongo

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func testMongo(t *testing.T) *Mongo {
	t.Helper()
	client, err := mongodriver.Connect(options.Client().ApplyURI("mongodb://127.0.0.1:27017"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(t.Context()) })
	mongo, err := NewMongo(client)
	if err != nil {
		t.Fatal(err)
	}
	return mongo
}

func TestClientBulk_accumulatesOrderedPairs(t *testing.T) {
	t.Parallel()
	mongo := testMongo(t)
	stats := mongo.AccountProductionTotals
	archived := mongo.ArchivedJobs

	bulk := mongo.Bulk().
		UpdateOne(stats, bson.M{"_id": "s1"}, bson.M{"$inc": bson.M{"n": 1}}, Upsert()).
		UpdateOne(archived, bson.M{"_id": "j1"}, bson.M{"$set": bson.M{"_meta.archiveProcessed": true}}).
		UpdateOne(stats, bson.M{"_id": "s2"}, bson.M{"$inc": bson.M{"n": 1}}, Upsert()).
		UpdateOne(archived, bson.M{"_id": "j2"}, bson.M{"$set": bson.M{"_meta.archiveProcessed": true}})

	if bulk.Len() != 4 {
		t.Fatalf("Len=%d want 4", bulk.Len())
	}
	if bulk.err != nil {
		t.Fatal(bulk.err)
	}
	if bulk.writes[0].Collection != CollectionAccountProductionTotals || bulk.writes[1].Collection != CollectionAccountArchivedJobs {
		t.Fatalf("pair order: %#v %#v", bulk.writes[0].Collection, bulk.writes[1].Collection)
	}
	u0, ok := bulk.writes[0].Model.(*mongodriver.ClientUpdateOneModel)
	if !ok || u0.Upsert == nil || !*u0.Upsert {
		t.Fatalf("first op upsert: %#v", bulk.writes[0].Model)
	}
}

func TestClientBulk_arrayFiltersAndInsertReplaceDelete(t *testing.T) {
	t.Parallel()
	mongo := testMongo(t)
	cat := mongo.TemplateCatalog
	pay := mongo.TemplatePayloads

	bulk := mongo.Bulk().
		InsertOne(pay, bson.M{"_id": "t1"}).
		UpdateOne(cat, bson.M{"_id": "acct"}, bson.M{"$set": bson.M{"templates.$[t].name": "n"}},
			ArrayFilters(bson.M{"t.templateID": "t1"})).
		ReplaceOne(pay, bson.M{"_id": "t1"}, bson.M{"_id": "t1", "v": 2}, Upsert()).
		DeleteOne(pay, bson.M{"_id": "t1"}).
		DeleteMany(mongo.Jobs, bson.M{"_meta.accountID": "acct"})

	if bulk.Len() != 5 {
		t.Fatalf("Len=%d want 5", bulk.Len())
	}
	u, ok := bulk.writes[1].Model.(*mongodriver.ClientUpdateOneModel)
	if !ok || len(u.ArrayFilters) != 1 {
		t.Fatalf("arrayFilters: %#v", bulk.writes[1].Model)
	}
	if _, ok := bulk.writes[0].Model.(*mongodriver.ClientInsertOneModel); !ok {
		t.Fatalf("insert: %T", bulk.writes[0].Model)
	}
	r, ok := bulk.writes[2].Model.(*mongodriver.ClientReplaceOneModel)
	if !ok || r.Upsert == nil || !*r.Upsert {
		t.Fatalf("replace upsert: %#v", bulk.writes[2].Model)
	}
}

func TestClientBulk_nilDocs(t *testing.T) {
	t.Parallel()
	mongo := testMongo(t)
	bulk := mongo.Bulk().UpdateOne(nil, bson.M{}, bson.M{"$set": bson.M{"a": 1}})
	_, err := bulk.RunOrdered(t.Context())
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestClientBulk_emptyRun(t *testing.T) {
	t.Parallel()
	mongo := testMongo(t)
	res, err := mongo.Bulk().RunOrdered(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if res == nil {
		t.Fatal("nil result")
	}
}
