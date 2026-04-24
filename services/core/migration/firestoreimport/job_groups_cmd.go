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
	"eve-industry-planner/shared/shared"

	"cloud.google.com/go/firestore"
	mongodriver "go.mongodb.org/mongo-driver/mongo"
	"google.golang.org/api/iterator"
)

// RunImportJobGroupsFromFirestore copies Firestore Users/{uid}/ProfileInfo/GroupData (groupData JSON array)
// into Mongo user_job_groups, one document per group (models.Group).
func RunImportJobGroupsFromFirestore(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("importJobGroupsFromFirestore", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks importJobGroupsFromFirestore [flags]\n")
		fs.PrintDefaults()
	}
	credentialsPath := fs.String("credentials", "", "optional service account JSON path (sets GOOGLE_APPLICATION_CREDENTIALS); mutually exclusive with -live and -dev")
	firebaseProjectID := fs.String("firebase-project-id", "", "optional FIREBASE_PROJECT_ID override; if credentials are set and this is omitted, project_id is read from that JSON")
	accountIDFlag := fs.String("account", "", "optional Firebase UID; import only this user")
	dryRun := fs.Bool("dry-run", false, "count group objects in GroupData (Firestore only; no Mongo)")
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
			logs.InfoCtx(ctx, "job groups import: using live Firebase credentials", "path", credPath)
		} else if *useDev {
			logs.InfoCtx(ctx, "job groups import: using dev Firebase credentials", "path", credPath)
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
		logs.InfoCtx(ctx, "job groups import: using FIREBASE_PROJECT_ID for this run", "project_id", projectID)
	}

	accountTrim := strings.TrimSpace(*accountIDFlag)
	if *dryRun {
		if accountTrim != "" {
			return importJobGroupsDryRunSingle(ctx, accountTrim)
		}
		return importJobGroupsDryRunScanAll(ctx, *loginWithin)
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
		return importJobGroupsSingleWrite(ctx, fsClient, clients.Mongo, accountTrim)
	}
	return importJobGroupsScanAllWrite(ctx, fsClient, clients.Mongo, *loginWithin)
}

func importJobGroupsDryRunSingle(ctx context.Context, accountID string) error {
	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	snap, err := firestoremig.GroupDataFirestoreRef(fsClient, accountID).Get(ctx)
	if err != nil {
		return err
	}
	if !snap.Exists() {
		fmt.Printf("Dry-run: no ProfileInfo/GroupData for account %q\n", accountID)
		return nil
	}
	n := firestoremig.GroupDataArrayLen(snap.Data())
	fmt.Printf("Dry-run: would upsert %d group document(s) for account %q into Mongo user_job_groups\n", n, accountID)
	return nil
}

func importJobGroupsDryRunScanAll(ctx context.Context, loginWithin time.Duration) error {
	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	var total, usersWithGroups, skippedAuth int
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
		n, err := firestoremig.CountGroupsInGroupDataFirestore(ctx, fsClient, accountID)
		if err != nil {
			return err
		}
		if n > 0 {
			usersWithGroups++
		}
		total += n
	}
	fmt.Printf("Dry-run: would upsert %d group document(s) across %d user(s) (by ProfileInfo/GroupData.groupData); skipped %d user(s) outside -login-within\n", total, usersWithGroups, skippedAuth)
	return nil
}

func importJobGroupsSingleWrite(ctx context.Context, fsClient *firestore.Client, mc *mongodriver.Client, accountID string) error {
	if mc == nil {
		return fmt.Errorf("mongo client is required")
	}
	written, skipped, skipDetails, err := firestoremig.UpsertUserJobGroupsFromGroupData(ctx, fsClient, mc, accountID)
	if err != nil {
		return err
	}
	if written == 0 && skipped == 0 {
		fmt.Printf("No ProfileInfo/GroupData or empty groupData for account %q; nothing written\n", accountID)
		return nil
	}
	printGroupDataSkipsForAccount(accountID, skipDetails)
	fmt.Printf("Upserted %d group document(s) for account %q (skipped %d invalid array element(s))\n", written, accountID, skipped)
	return nil
}

func importJobGroupsScanAllWrite(ctx context.Context, fsClient *firestore.Client, mc *mongodriver.Client, loginWithin time.Duration) error {
	if mc == nil {
		return fmt.Errorf("mongo client is required")
	}
	var totalWritten, totalSkipped, errN, skippedAuth int
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
			logs.WarnCtx(ctx, "job groups import: empty user document id", "firestore_path", snap.Ref.Path)
			errN++
			continue
		}
		include, aerr := firebaseadmin.AccountHasAuthActivitySince(ctx, accountID, loginWithin)
		if aerr != nil {
			logs.ErrorCtx(ctx, "job groups import: auth recency", "account_id", accountID, "error", aerr)
			errN++
			continue
		}
		if !include {
			skippedAuth++
			continue
		}
		w, sk, skipDetails, err := firestoremig.UpsertUserJobGroupsFromGroupData(ctx, fsClient, mc, accountID)
		if err != nil {
			logs.ErrorCtx(ctx, "job groups import", "account_id", accountID, "error", err)
			errN++
			continue
		}
		printGroupDataSkipsForAccount(accountID, skipDetails)
		totalWritten += w
		totalSkipped += sk
	}
	if errN > 0 {
		return fmt.Errorf("import finished with %d account error(s) (groups upserted=%d, array elements skipped=%d)", errN, totalWritten, totalSkipped)
	}
	fmt.Printf("Upserted %d group document(s) total; skipped %d invalid array element(s); skipped %d user(s) outside -login-within\n", totalWritten, totalSkipped, skippedAuth)
	return nil
}

func printGroupDataSkipsForAccount(accountID string, skips []firestoremig.GroupDataImportSkip) {
	if len(skips) == 0 {
		return
	}
	fmt.Printf("Skipped %d groupData[] element(s) for account %q (see ProfileInfo/GroupData in Firestore):\n", len(skips), accountID)
	for _, s := range skips {
		fmt.Printf("  %s\n", s.String())
	}
}
