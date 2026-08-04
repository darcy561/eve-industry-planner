package mongo_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	legacy "eve-industry-planner/shared/core/mongo"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Deeper parity against real documents:
//
//	EIP_MONGO_PARITY_LIVE=1  — connect with env (same as stack) and sample collections
//	or place export under .tmp/mongo-parity (see cmd/mongo_parity_sample)
//
// Skips when neither live env nor fixture files are available.

func TestParity_realDocs_AsDocumentM_andUnmarshal(t *testing.T) {
	docs := loadParitySampleDocs(t)
	if len(docs) == 0 {
		t.Skip("no live Mongo (EIP_MONGO_PARITY_LIVE=1) and no fixtures under .tmp/mongo-parity — run cmd/mongo_parity_sample")
	}

	for i, doc := range docs {
		got := eipmongo.AsDocumentM(doc)
		want := legacy.AsDocumentM(doc)
		if !asDocumentMEqual(got, want) {
			t.Fatalf("doc[%d] AsDocumentM mismatch", i)
		}

		raw, err := bson.Marshal(doc)
		if err != nil {
			t.Fatalf("doc[%d] marshal: %v", i, err)
		}
		gotU, errNew := eipmongo.UnmarshalDocumentM(raw)
		wantU, errOld := legacy.UnmarshalDocumentM(raw)
		if (errNew == nil) != (errOld == nil) {
			t.Fatalf("doc[%d] Unmarshal err new=%v legacy=%v", i, errNew, errOld)
		}
		if errNew != nil {
			continue
		}
		if !asDocumentMEqual(gotU, wantU) {
			t.Fatalf("doc[%d] UnmarshalDocumentM mismatch", i)
		}

		// StructToMongoDoc parity on re-decoded map-as-value with stable string _id when present.
		id, _ := doc["_id"].(string)
		if id == "" {
			continue
		}
		gotDoc, errNew := eipmongo.StructToMongoDoc(doc, id)
		wantDoc, errOld := legacy.StructToMongoDoc(doc, id)
		if (errNew == nil) != (errOld == nil) {
			t.Fatalf("doc[%d] StructToMongoDoc err new=%v legacy=%v", i, errNew, errOld)
		}
		if errNew != nil {
			continue
		}
		if !asDocumentMEqual(gotDoc, wantDoc) {
			t.Fatalf("doc[%d] StructToMongoDoc mismatch", i)
		}
	}
	t.Logf("parity ok on %d real/fixture documents", len(docs))
}

func loadParitySampleDocs(t *testing.T) []bson.M {
	t.Helper()
	if os.Getenv("EIP_MONGO_PARITY_LIVE") == "1" {
		return loadLiveSampleDocs(t)
	}
	return loadFixtureSampleDocs(t)
}

func loadLiveSampleDocs(t *testing.T) []bson.M {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	mongo, err := eipmongo.ConnectPrimary()
	if err != nil {
		t.Fatalf("live connect: %v", err)
	}
	t.Cleanup(func() { mongo.Disconnect(ctx) })

	if err := mongo.Ping(ctx); err != nil {
		t.Fatalf("ping: %v", err)
	}

	limit := int64(20)
	docsHandles := []*eipmongo.Docs{
		mongo.JobDocuments,
		mongo.Groups,
		mongo.ArchivedJobs,
		mongo.BuildStats,
		mongo.TemplateCatalog,
		mongo.TemplatePayloads,
		mongo.Blueprints,
	}
	var out []bson.M
	for _, d := range docsHandles {
		cur, err := d.Collection().Find(ctx, bson.M{}, options.Find().SetLimit(limit))
		if err != nil {
			t.Fatalf("%s find: %v", d.Collection().Name(), err)
		}
		var batch []bson.M
		if err := cur.All(ctx, &batch); err != nil {
			_ = cur.Close(ctx)
			t.Fatalf("%s all: %v", d.Collection().Name(), err)
		}
		_ = cur.Close(ctx)
		out = append(out, batch...)
	}
	return out
}

func loadFixtureSampleDocs(t *testing.T) []bson.M {
	t.Helper()
	dir := os.Getenv("MONGO_PARITY_FIXTURE_DIR")
	if dir == "" {
		// shared/mongo → repo .tmp/mongo-parity
		dir = filepath.Join("..", "..", "..", ".tmp", "mongo-parity")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []bson.M
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" || e.Name() == "manifest.json" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		var file struct {
			Docs []json.RawMessage `json:"docs"`
		}
		if err := json.Unmarshal(raw, &file); err != nil {
			t.Fatalf("parse %s: %v", e.Name(), err)
		}
		for _, d := range file.Docs {
			var m bson.M
			if err := bson.UnmarshalExtJSON(d, false, &m); err != nil {
				t.Fatalf("extjson %s: %v", e.Name(), err)
			}
			out = append(out, m)
		}
	}
	return out
}
