package commands

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

const firestoreUsersTopCollection = "Users"

// runImportUserAccountsFromFirestoreScan iterates Firestore Users/{uid} and publishes one
// migrateUserDocumentToMongo worker task per document (same pattern as importArchivedJobsFromFirestore).
func runImportUserAccountsFromFirestoreScan(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("importUserAccountsFromFirestore", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks importUserAccountsFromFirestore [flags]\n")
		fs.PrintDefaults()
	}
	credentialsPath := fs.String("credentials", "", "optional service account JSON path (sets GOOGLE_APPLICATION_CREDENTIALS); mutually exclusive with -live and -dev")
	firebaseProjectID := fs.String("firebase-project-id", "", "optional FIREBASE_PROJECT_ID override; if credentials are set and this is omitted, project_id is read from that JSON")
	accountIDFlag := fs.String("account", "", "optional Firebase UID; enqueue only this user (Users/{uid} must exist)")
	dryRun := fs.Bool("dry-run", false, "print how many tasks would be published without enqueuing")
	loginWithin := fs.Duration("login-within", firebaseadmin.DefaultRecencyForActiveAccounts, "scan-all only: only enqueue for Auth users whose last sign-in or account creation is within this window (0=all Firestore users)")
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
			logs.InfoCtx(ctx, "user accounts scan: using live Firebase credentials", "path", credPath)
		} else if *useDev {
			logs.InfoCtx(ctx, "user accounts scan: using dev Firebase credentials", "path", credPath)
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
		logs.InfoCtx(ctx, "user accounts scan: using FIREBASE_PROJECT_ID for this run", "project_id", projectID)
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.NATS)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	if err := natscore.EnsureWorkerTaskStream(clients.JetStream); err != nil {
		return fmt.Errorf("ensure worker task stream: %w", err)
	}

	fsClient, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	taskDef := taskscore.MigrateUserDocumentToMongo
	accountTrim := strings.TrimSpace(*accountIDFlag)

	if accountTrim != "" {
		return publishMigrateUserTasksSingle(ctx, clients, fsClient, taskDef, accountTrim, *dryRun)
	}
	return publishMigrateUserTasksScanAll(ctx, clients, fsClient, taskDef, *dryRun, *loginWithin)
}

func publishMigrateUserTasksSingle(
	ctx context.Context,
	clients *stackservices.Clients,
	fsClient *firestore.Client,
	taskDef taskscore.Task,
	accountID string,
	dryRun bool,
) error {
	snap, err := fsClient.Collection(firestoreUsersTopCollection).Doc(accountID).Get(ctx)
	if err != nil {
		return fmt.Errorf("get firestore user document: %w", err)
	}
	if !snap.Exists() {
		return fmt.Errorf("firestore Users/%s does not exist", accountID)
	}
	if dryRun {
		logs.InfoCtx(ctx, "user accounts scan dry-run: would enqueue 1 task", "account_id", accountID)
		fmt.Printf("Dry-run: would enqueue 1 migrate task for account %q on subject %q\n", accountID, taskDef.Subject)
		return nil
	}
	req := natscore.MigrateUserDocumentToMongoRequest{AccountID: accountID}
	if err := natscore.PublishTask(ctx, clients.JetStream, taskDef.Subject, taskDef.Name, req, clients.NATS, taskscore.Priority5); err != nil {
		return fmt.Errorf("publish task for %s: %w", accountID, err)
	}
	fmt.Printf("Enqueued 1 migrate task for account %q on subject %q\n", accountID, taskDef.Subject)
	return nil
}

func publishMigrateUserTasksScanAll(
	ctx context.Context,
	clients *stackservices.Clients,
	fsClient *firestore.Client,
	taskDef taskscore.Task,
	dryRun bool,
	loginWithin time.Duration,
) error {
	iter := fsClient.Collection(firestoreUsersTopCollection).Documents(ctx)

	var wouldEnqueue, published, errorsN, skippedAuthWindow int
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
			logs.WarnCtx(ctx, "user accounts scan: empty document id", "firestore_path", snap.Ref.Path)
			errorsN++
			continue
		}

		include, err := firebaseadmin.AccountHasAuthActivitySince(ctx, accountID, loginWithin)
		if err != nil {
			logs.ErrorCtx(ctx, "user accounts scan: auth recency", "account_id", accountID, "error", err)
			errorsN++
			continue
		}
		if !include {
			skippedAuthWindow++
			continue
		}

		wouldEnqueue++
		if dryRun {
			continue
		}

		req := natscore.MigrateUserDocumentToMongoRequest{AccountID: accountID}
		if err := natscore.PublishTask(ctx, clients.JetStream, taskDef.Subject, taskDef.Name, req, clients.NATS, taskscore.Priority5); err != nil {
			logs.ErrorCtx(ctx, "user accounts scan: publish task", "account_id", accountID, "error", err)
			errorsN++
			continue
		}
		published++
	}

	if dryRun {
		logs.InfoCtx(ctx, "user accounts scan dry-run finished", "would_enqueue", wouldEnqueue, "skipped_outside_login_window", skippedAuthWindow)
		fmt.Printf("Dry-run: would enqueue %d migrate task(s) on subject %q; skipped %d account(s) outside -login-within (worker skips accounts already complete in Mongo)\n", wouldEnqueue, taskDef.Subject, skippedAuthWindow)
		return nil
	}

	logs.InfoCtx(ctx, "user accounts scan finished", "published_tasks", published, "skipped_or_failed", errorsN, "skipped_outside_login_window", skippedAuthWindow)
	if errorsN > 0 {
		return fmt.Errorf("enqueue completed with %d publication errors (published=%d)", errorsN, published)
	}
	fmt.Printf("Enqueued %d migrate task(s) on subject %q; skipped %d account(s) outside -login-within (worker skips accounts already complete in Mongo)\n", published, taskDef.Subject, skippedAuthWindow)
	return nil
}
