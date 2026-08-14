// Command mongo_parity_sample pulls sample documents from a live Mongo into
// .tmp/mongo-parity/ for rebuild parity tests.
//
// Output is gitignored — may contain account data. Do not commit.
//
// Example (stack up, from services/, same pattern as mongo_driver_v2_smoke):
//
//	set GOOS=linux& set GOARCH=amd64& set CGO_ENABLED=0
//	go build -o ../.tmp/mongo_parity_sample ./cmd/mongo_parity_sample
//	docker run --rm --network eip-core --env-file ../.env -e MONGO_HOST=mongo -e MONGO_PORT=27017 ^
//	  -e MONGO_PARITY_LIMIT=50 -v %CD%/../.tmp:/out -v %CD%/../.tmp/mongo_parity_sample:/sample:ro ^
//	  -e MONGO_PARITY_OUT=/out/mongo-parity --entrypoint /sample alpine:3.20
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	outDir := envOr("MONGO_PARITY_OUT", filepath.Join("..", ".tmp", "mongo-parity"))
	limit := 25
	if v := os.Getenv("MONGO_PARITY_LIMIT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return fmt.Errorf("MONGO_PARITY_LIMIT must be a positive int")
		}
		limit = n
	}

	mongo, err := eipmongo.ConnectPrimary()
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer mongo.Disconnect(ctx)

	if err := mongo.Ping(ctx); err != nil {
		return fmt.Errorf("ping: %w", err)
	}

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}

	collections := []string{
		eipmongo.CollectionUserJobDocuments,
		eipmongo.CollectionUserJobGroups,
		eipmongo.CollectionArchivedJobs,
		eipmongo.CollectionBuildStats,
		eipmongo.CollectionUserGroupTemplateCatalog,
		eipmongo.CollectionUserGroupTemplatePayloads,
		eipmongo.CollectionApplicationSettings,
		eipmongo.CollectionUsers,
		eipmongo.CollectionBlueprints,
		eipmongo.CollectionCitadelNames,
	}

	manifest := map[string]any{
		"database": eipmongo.DatabaseName,
		"limit":    limit,
		"pulled":   map[string]int{},
		"note":     "gitignored sample export for mongo rebuild parity; may contain PII — do not commit",
	}
	pulled := manifest["pulled"].(map[string]int)

	for _, name := range collections {
		n, err := exportCollection(ctx, mongo, outDir, name, limit)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		pulled[name] = n
		fmt.Printf("ok: %s → %d docs\n", name, n)
	}

	raw, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(outDir, "manifest.json"), raw, 0o644); err != nil {
		return err
	}
	fmt.Printf("PASS: wrote samples under %s\n", outDir)
	return nil
}

func exportCollection(ctx context.Context, mongo *eipmongo.Mongo, outDir, name string, limit int) (int, error) {
	coll := mongo.Coll(name)
	cur, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(int64(limit)))
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)

	var docs []bson.M
	if err := cur.All(ctx, &docs); err != nil {
		return 0, err
	}
	for i := range docs {
		sanitizeDoc(docs[i])
	}

	// Extended JSON via bson.MarshalExtJSON so types round-trip for offline tests.
	type fileDoc struct {
		Docs []json.RawMessage `json:"docs"`
	}
	out := fileDoc{Docs: make([]json.RawMessage, 0, len(docs))}
	for _, d := range docs {
		b, err := bson.MarshalExtJSON(d, false, false)
		if err != nil {
			return 0, err
		}
		out.Docs = append(out.Docs, json.RawMessage(b))
	}
	raw, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return 0, err
	}
	path := filepath.Join(outDir, name+".json")
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		return 0, err
	}
	return len(docs), nil
}

// Drop obvious secrets; samples may still include account IDs / job graphs.
func sanitizeDoc(doc bson.M) {
	if doc == nil {
		return
	}
	for _, k := range []string{
		"refreshToken", "refresh_token", "encryptedRefreshToken",
		"password", "token", "secret", "esiRefreshToken",
	} {
		delete(doc, k)
	}
	if meta, ok := doc["_meta"].(bson.M); ok {
		for _, k := range []string{"refreshToken", "token", "secret"} {
			delete(meta, k)
		}
	}
	// Nested cloudStoredEsi style maps if present as bson.M.
	for _, k := range []string{"cloudStoredEsiRefreshTokens", "esiTokens"} {
		if nested, ok := doc[k].(bson.M); ok {
			for id, v := range nested {
				if m, ok := v.(bson.M); ok {
					sanitizeDoc(m)
					nested[id] = m
				}
			}
		}
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
