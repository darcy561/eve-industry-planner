package commands

import (
	"context"
	"encoding/json"
	"eve-industry-planner/shared/lifecycle"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/logs"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/genproto/googleapis/type/latlng"
)

// runImportArchivedJobsFromFirestoreScan queries Firestore collection group ArchivedJobs and publishes
// one low-priority NATS task per document for the worker to normalise and upsert into MongoDB.
func runImportArchivedJobsFromFirestoreScan(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("importArchivedJobsFromFirestore", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks importArchivedJobsFromFirestore [flags]\n")
		fs.PrintDefaults()
	}
	unprocessedOnly := fs.Bool("unprocessed-only", false, "only documents where archiveProcessed==false (may require a Firestore index); ignored if -reprocess is set")
	reprocess := fs.Bool("reprocess", false, "enqueue all ArchivedJobs docs including archiveProcessed==true (full re-import); overrides -unprocessed-only")
	credentialsPath := fs.String("credentials", "", "optional service account JSON path for this run only (sets GOOGLE_APPLICATION_CREDENTIALS); default in compose is /app/adminSDK.json")
	firebaseProjectID := fs.String("firebase-project-id", "", "optional FIREBASE_PROJECT_ID override; if -credentials is set and this is omitted, project_id is read from that JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *credentialsPath != "" {
		if err := os.Setenv("GOOGLE_APPLICATION_CREDENTIALS", *credentialsPath); err != nil {
			return fmt.Errorf("credentials: %w", err)
		}
	}

	projectID := strings.TrimSpace(*firebaseProjectID)
	if projectID == "" && *credentialsPath != "" {
		var err error
		projectID, err = projectIDFromServiceAccountJSON(*credentialsPath)
		if err != nil {
			return fmt.Errorf("firebase project: %w", err)
		}
	}
	if projectID != "" {
		if err := os.Setenv("FIREBASE_PROJECT_ID", projectID); err != nil {
			return fmt.Errorf("firebase-project-id: %w", err)
		}
		logs.InfoCtx(ctx, "archived job scan: using FIREBASE_PROJECT_ID for this run", "project_id", projectID)
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.NATS)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	batch := clients.NATS.Batching()
	if _, err := clients.NATS.Tasks.Ensure(ctx); err != nil {
		return fmt.Errorf("ensure worker task stream: %w", err)
	}

	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	query := fsClient.CollectionGroup("ArchivedJobs").Query
	filterUnprocessed := *unprocessedOnly && !*reprocess
	if filterUnprocessed {
		query = query.Where("archiveProcessed", "==", false)
	}
	if *reprocess {
		logs.InfoCtx(ctx, "archived job scan: reprocess=true, including archiveProcessed documents")
	}

	taskDef := eipnats.ImportArchivedJobToMongo
	iter := query.Documents(ctx)

	var published, errorsN int
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("firestore iteration: %w", err)
		}

		userID := ""
		if snap.Ref.Parent != nil && snap.Ref.Parent.Parent != nil {
			userID = snap.Ref.Parent.Parent.ID
		}
		if userID == "" {
			logs.WarnCtx(ctx, "archived job scan: missing user id from path", "firestore_path", snap.Ref.Path, "doc_id", snap.Ref.ID)
			errorsN++
			continue
		}

		rawMap := snap.Data()
		docJSON, err := json.Marshal(firestoreMapToJSONSafe(rawMap))
		if err != nil {
			logs.ErrorCtx(ctx, "archived job scan: marshal document", "firestore_path", snap.Ref.Path, "error", err)
			errorsN++
			continue
		}

		if err := eipnats.PublishImportArchivedJobToMongo(ctx, batch, userID, snap.Ref.Path, snap.Ref.ID, docJSON, ""); err != nil {
			logs.ErrorCtx(ctx, "archived job scan: publish task", "firestore_path", snap.Ref.Path, "error", err)
			errorsN++
			continue
		}
		published++
	}

	logs.InfoCtx(ctx, "archived job scan finished", "published_tasks", published, "skipped_or_failed", errorsN)
	if err := batch.Wait(ctx); err != nil {
		return fmt.Errorf("enqueue importArchivedJobToMongo: %w", err)
	}
	if errorsN > 0 {
		return fmt.Errorf("enqueue completed with %d publication errors (published=%d)", errorsN, published)
	}
	fmt.Printf("Enqueued %d import task(s) on subject %q (worker resolves canonical build version during import)\n", published, taskDef.Subject)
	return nil
}

// firestoreMapToJSONSafe converts Firestore snapshot values to JSON-friendly shapes (same idea as archivejobs-sample).
func firestoreMapToJSONSafe(v any) any {
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
			out[i] = firestoreMapToJSONSafe(el)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, el := range x {
			out[k] = firestoreMapToJSONSafe(el)
		}
		return out
	default:
		return fmt.Sprintf("%v", x)
	}
}

func projectIDFromServiceAccountJSON(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var meta struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(b, &meta); err != nil {
		return "", fmt.Errorf("parse service account %s: %w", path, err)
	}
	if meta.ProjectID == "" {
		return "", fmt.Errorf("service account %s: missing project_id", path)
	}
	return meta.ProjectID, nil
}
