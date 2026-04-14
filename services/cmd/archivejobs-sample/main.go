// Command archivejobs-sample exports Firestore ArchivedJobs (collection group) to JSON.
// Use -limit for a cap or -all to stream every document (Firestore paginates internally).
//
// See ../../../migration/README.md for usage (repo root: migration/README.md).
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"cloud.google.com/go/firestore"
	"eve-industry-planner/shared/firebaseadmin"
	"google.golang.org/api/iterator"
	"google.golang.org/genproto/googleapis/type/latlng"
)

func main() {
	limit := flag.Int("limit", 25, "maximum documents to export when -all is false")
	exportAll := flag.Bool("all", false, "export every ArchivedJobs document (ignores -limit)")
	outDir := flag.String("out", "./archivejobs_firestore_samples", "output directory (created if missing)")
	unprocessedOnly := flag.Bool("unprocessed-only", false, "only documents where archiveProcessed==false (may require a Firestore index)")
	flag.Parse()

	ctx := context.Background()
	client, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		log.Fatalf("firestore client: %v", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	query := client.CollectionGroup("ArchivedJobs").Query
	if *unprocessedOnly {
		query = query.Where("archiveProcessed", "==", false)
	}
	if !*exportAll {
		if *limit < 1 {
			log.Fatal("-limit must be >= 1 unless you pass -all")
		}
		query = query.Limit(*limit)
	}

	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		log.Fatalf("mkdir out: %v", err)
	}

	iter := query.Documents(ctx)
	type manifestRow struct {
		File          string `json:"file"`
		FirestorePath string `json:"firestorePath"`
		UserID        string `json:"userId"`
		BuildVer      any    `json:"buildVer,omitempty"`
		JobID         any    `json:"jobID,omitempty"`
	}
	var manifest []manifestRow
	n := 0

	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Fatalf("query: %v", err)
		}
		n++
		raw := snap.Data()
		fileName := fmt.Sprintf("job_%08d_%s.json", n, snap.Ref.ID)
		outPath := filepath.Join(*outDir, fileName)

		userID := ""
		if snap.Ref.Parent != nil && snap.Ref.Parent.Parent != nil {
			userID = snap.Ref.Parent.Parent.ID
		}

		wrapped := map[string]any{
			"firestorePath": snap.Ref.Path,
			"userId":        userID,
			"data":          toJSONSafe(raw),
		}

		payload, err := json.MarshalIndent(wrapped, "", "  ")
		if err != nil {
			log.Fatalf("marshal %s: %v", outPath, err)
		}
		if err := os.WriteFile(outPath, payload, 0o644); err != nil {
			log.Fatalf("write %s: %v", outPath, err)
		}

		manifest = append(manifest, manifestRow{
			File:          fileName,
			FirestorePath: snap.Ref.Path,
			UserID:        userID,
			BuildVer:      rootBuildVer(raw),
			JobID:         raw["jobID"],
		})
	}

	manPath := filepath.Join(*outDir, "manifest.json")
	manPayload, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		log.Fatalf("manifest marshal: %v", err)
	}
	if err := os.WriteFile(manPath, manPayload, 0o644); err != nil {
		log.Fatalf("write manifest: %v", err)
	}
	log.Printf("exported %d document(s) to %s", n, *outDir)
}

func rootBuildVer(m map[string]any) any {
	if v, ok := m["buildVer"]; ok {
		return v
	}
	if meta, ok := m["_meta"].(map[string]any); ok {
		if v, ok := meta["buildVer"]; ok {
			return v
		}
	}
	return nil
}

func toJSONSafe(v any) any {
	switch x := v.(type) {
	case nil:
		return nil
	case bool, string, float64, float32, int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64:
		return x
	case time.Time:
		return x.UTC().Format(time.RFC3339Nano)
	case *latlng.LatLng:
		if x == nil {
			return nil
		}
		return map[string]float64{"latitude": x.Latitude, "longitude": x.Longitude}
	case *firestore.DocumentRef:
		if x == nil {
			return nil
		}
		return x.Path
	case []byte:
		return map[string]any{"_type": "bytes", "len": len(x)}
	case []any:
		out := make([]any, len(x))
		for i, el := range x {
			out[i] = toJSONSafe(el)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, el := range x {
			out[k] = toJSONSafe(el)
		}
		return out
	default:
		if m, ok := x.(json.Marshaler); ok {
			return m
		}
		return fmt.Sprintf("%v", x)
	}
}
