package firestoreimport

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"eve-industry-planner/shared/migration/firestoremig"
	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"

	"cloud.google.com/go/firestore"
	mongodriver "go.mongodb.org/mongo-driver/mongo"
	"google.golang.org/api/iterator"
)

// RunImportWatchlistFromFirestore copies Firestore Users/{uid}/ProfileInfo/Watchlist into Mongo user_watchlist_deprecated.
func RunImportWatchlistFromFirestore(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("importWatchlistFromFirestore", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks importWatchlistFromFirestore [flags]\n")
		fs.PrintDefaults()
	}
	credentialsPath := fs.String("credentials", "", "optional service account JSON path (sets GOOGLE_APPLICATION_CREDENTIALS); mutually exclusive with -live and -dev")
	firebaseProjectID := fs.String("firebase-project-id", "", "optional FIREBASE_PROJECT_ID override; if credentials are set and this is omitted, project_id is read from that JSON")
	accountIDFlag := fs.String("account", "", "optional Firebase UID; import only this user (ProfileInfo/Watchlist must exist to write)")
	dryRun := fs.Bool("dry-run", false, "list accounts that have a watchlist document without writing Mongo")
	loginWithin := fs.Duration("login-within", firebaseadmin.DefaultRecencyForActiveAccounts, "scan-all only: only process Auth users with last sign-in or account creation within this window (0=all Firestore users)")
	useLive := fs.Bool("live", false, "use live Firebase service account (compose: /app/adminSDKLive.json); mutually exclusive with -dev and -credentials")
	useDev := fs.Bool("dev", false, "use dev Firebase service account (compose: /app/adminSDK.json); mutually exclusive with -live and -credentials")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if *useLive && *useDev {
		return fmt.Errorf("-live and -dev are mutually exclusive")
	}
	credPath := strings.TrimSpace(*credentialsPath)
	if credPath != "" && (*useLive || *useDev) {
		return fmt.Errorf("-credentials cannot be used with -live or -dev")
	}
	switch {
	case *useLive:
		credPath = "/app/adminSDKLive.json"
	case *useDev:
		credPath = "/app/adminSDK.json"
	}

	if credPath != "" {
		if err := os.Setenv("GOOGLE_APPLICATION_CREDENTIALS", credPath); err != nil {
			return fmt.Errorf("credentials: %w", err)
		}
		if *useLive {
			logs.InfoCtx(ctx, "watchlist import: using live Firebase credentials", "path", credPath)
		} else if *useDev {
			logs.InfoCtx(ctx, "watchlist import: using dev Firebase credentials", "path", credPath)
		}
	}

	projectID := strings.TrimSpace(*firebaseProjectID)
	if projectID == "" && credPath != "" {
		var err error
		projectID, err = projectIDFromServiceAccountJSON(credPath)
		if err != nil {
			return fmt.Errorf("firebase project: %w", err)
		}
	}
	if projectID != "" {
		if err := os.Setenv("FIREBASE_PROJECT_ID", projectID); err != nil {
			return fmt.Errorf("firebase-project-id: %w", err)
		}
		logs.InfoCtx(ctx, "watchlist import: using FIREBASE_PROJECT_ID for this run", "project_id", projectID)
	}

	accountTrim := strings.TrimSpace(*accountIDFlag)
	if *dryRun {
		if accountTrim != "" {
			return importWatchlistDryRunSingle(ctx, accountTrim)
		}
		return importWatchlistDryRunScanAll(ctx, *loginWithin)
	}

	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	if accountTrim != "" {
		return importWatchlistSingleWrite(ctx, fsClient, clients.Mongo, accountTrim)
	}
	return importWatchlistScanAllWrite(ctx, fsClient, clients.Mongo, *loginWithin)
}

func importWatchlistDryRunSingle(ctx context.Context, accountID string) error {
	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	snap, err := firestoremig.WatchlistFirestoreRef(fsClient, accountID).Get(ctx)
	if err != nil {
		return fmt.Errorf("get firestore watchlist: %w", err)
	}
	if !snap.Exists() {
		fmt.Printf("Dry-run: no ProfileInfo/Watchlist for account %q (nothing would be written)\n", accountID)
		return nil
	}
	fmt.Printf("Dry-run: would upsert 1 watchlist for account %q into Mongo user_watchlist_deprecated\n", accountID)
	return nil
}

func importWatchlistDryRunScanAll(ctx context.Context, loginWithin time.Duration) error {
	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	var would, missing, skippedAuth int
	iter := fsClient.Collection(firestoremig.FirestoreUsersCollection).Documents(ctx)
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("firestore iteration: %w", err)
		}
		accountID := snap.Ref.ID
		if accountID == "" {
			continue
		}
		include, err := firebaseadmin.AccountHasAuthActivitySince(ctx, accountID, loginWithin)
		if err != nil {
			return fmt.Errorf("auth recency for %q: %w", accountID, err)
		}
		if !include {
			skippedAuth++
			continue
		}
		ws, err := firestoremig.WatchlistFirestoreRef(fsClient, accountID).Get(ctx)
		if err != nil {
			return fmt.Errorf("get watchlist for %q: %w", accountID, err)
		}
		if ws.Exists() {
			would++
		} else {
			missing++
		}
	}
	fmt.Printf("Dry-run: would upsert %d watchlist document(s) (Users without watchlist: %d); skipped %d user(s) outside -login-within\n", would, missing, skippedAuth)
	return nil
}

func importWatchlistSingleWrite(ctx context.Context, fsClient *firestore.Client, mc *mongodriver.Client, accountID string) error {
	if mc == nil {
		return fmt.Errorf("mongo client is required")
	}
	migrated, err := firestoremig.UpsertUserWatchlistDeprecatedFromFirestore(ctx, fsClient, mc, accountID)
	if err != nil {
		return err
	}
	if !migrated {
		fmt.Printf("No ProfileInfo/Watchlist for account %q; skipped\n", accountID)
		return nil
	}
	fmt.Printf("Upserted watchlist for account %q into user_watchlist_deprecated\n", accountID)
	return nil
}

func importWatchlistScanAllWrite(ctx context.Context, fsClient *firestore.Client, mc *mongodriver.Client, loginWithin time.Duration) error {
	if mc == nil {
		return fmt.Errorf("mongo client is required")
	}
	var written, skipped, errN, skippedAuth int
	iter := fsClient.Collection(firestoremig.FirestoreUsersCollection).Documents(ctx)
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("firestore iteration: %w", err)
		}
		accountID := snap.Ref.ID
		if accountID == "" {
			logs.WarnCtx(ctx, "watchlist import: empty user document id", "firestore_path", snap.Ref.Path)
			errN++
			continue
		}
		include, aerr := firebaseadmin.AccountHasAuthActivitySince(ctx, accountID, loginWithin)
		if aerr != nil {
			logs.ErrorCtx(ctx, "watchlist import: auth recency", "account_id", accountID, "error", aerr)
			errN++
			continue
		}
		if !include {
			skippedAuth++
			continue
		}
		migrated, err := firestoremig.UpsertUserWatchlistDeprecatedFromFirestore(ctx, fsClient, mc, accountID)
		if err != nil {
			logs.ErrorCtx(ctx, "watchlist import: upsert", "account_id", accountID, "error", err)
			errN++
			continue
		}
		if migrated {
			written++
		} else {
			skipped++
		}
	}
	if errN > 0 {
		return fmt.Errorf("import finished with %d error(s) (upserted=%d, no watchlist in Firestore=%d)", errN, written, skipped)
	}
	fmt.Printf("Upserted %d watchlist document(s); skipped %d user(s) with no Firestore watchlist; skipped %d user(s) outside -login-within\n", written, skipped, skippedAuth)
	return nil
}
