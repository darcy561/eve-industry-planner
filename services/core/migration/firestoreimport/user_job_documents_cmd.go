package firestoreimport

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/migration/firestoremig"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	taskscore "eve-industry-planner/shared/tasks"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// RunImportUserJobDocumentsFromFirestore imports live job docs from Firestore Users/{uid}/Jobs/{id}
// into Mongo user_job_documents, using job ids gathered from JobSnapshot, Firestore GroupData, and
// Mongo user_job_groups (see firestoremig.CollectReferenceJobIDsForUser). References with no
// Firestore job document are skipped (stale / missing in error by design).
func RunImportUserJobDocumentsFromFirestore(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("importUserJobDocumentsFromFirestore", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks importUserJobDocumentsFromFirestore [flags]\n\n")
		fmt.Fprintf(fs.Output(), "All accounts: enqueues one importUserJobDocumentsForAccount worker task per Firestore user (priority_5), fast (no Auth in this process).\n")
		fmt.Fprintf(fs.Output(), "  Login recency (~2y of Auth activity) is checked inside each worker task unless you pass -skip-auth-recency.\n")
		fmt.Fprintf(fs.Output(), "  Use -inline to run the import in this process instead (slow). Dry-run without -inline counts Firestore users that would get a task.\n\n")
		fs.PrintDefaults()
	}
	credentialsPath := fs.String("credentials", "", "optional service account JSON path; mutually exclusive with -live and -dev")
	firebaseProjectID := fs.String("firebase-project-id", "", "optional FIREBASE_PROJECT_ID override")
	accountIDFlag := fs.String("account", "", "optional Firebase UID; import or enqueue only this user")
	dryRun := fs.Bool("dry-run", false, "count reference ids and Firestore job docs found (no Mongo writes)")
	inline := fs.Bool("inline", false, "all accounts: run the import in this process instead of enqueuing worker tasks (slow)")
	enqueue := fs.Bool("enqueue", false, "with -account, publish one worker task instead of importing in this process")
	skipAuthRecency := fs.Bool("skip-auth-recency", false, "when enqueuing for all users: skip login-recency in each worker (import every account)")
	useLive := fs.Bool("live", false, "use live Firebase credentials; mutually exclusive with -dev and -credentials")
	useDev := fs.Bool("dev", false, "use dev Firebase credentials; mutually exclusive with -live and -credentials")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *inline && *enqueue {
		return fmt.Errorf("-inline and -enqueue cannot be used together")
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
	}

	accountTrim := strings.TrimSpace(*accountIDFlag)
	if *dryRun {
		if accountTrim == "" {
			if *inline {
				return dryRunImportUserJobDocumentsScanAll(ctx)
			}
			return dryRunEnqueueUserJobDocumentTasksScanAll(ctx)
		}
		return dryRunImportUserJobDocumentsSingle(ctx, accountTrim)
	}

	if accountTrim == "" && !*inline {
		// Default: one importUserJobDocumentsForAccount task per Firestore user (lowest-priority queue).
		return publishImportUserJobDocumentTasksScanAll(ctx, *skipAuthRecency)
	}
	if accountTrim != "" && *enqueue {
		return publishImportUserJobDocumentTaskSingle(ctx, accountTrim)
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Mongo)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	fsc, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	if accountTrim != "" {
		return importUserJobDocumentsSingleWrite(ctx, fsc, clients.Mongo, accountTrim)
	}
	return importUserJobDocumentsScanAllWrite(ctx, fsc, clients.Mongo)
}

func dryRunEnqueueUserJobDocumentTasksScanAll(ctx context.Context) error {
	fsc, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()
	var n int
	iter := fsc.Collection(firestoremig.FirestoreUsersCollection).Documents(ctx)
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("firestore iteration: %w", err)
		}
		aid := strings.TrimSpace(snap.Ref.ID)
		if aid == "" {
			continue
		}
		n++
	}
	fmt.Printf("Dry-run: would enqueue %d importUserJobDocumentsForAccount task(s) (Users in %q; login recency is applied in each worker task)\n", n, firestoremig.FirestoreUsersCollection)
	return nil
}

func publishImportUserJobDocumentTasksScanAll(ctx context.Context, skipAuthRecency bool) error {
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.NATS)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)
	if err := eipnats.EnsureWorkerTaskStream(clients.NATS.JS()); err != nil {
		return fmt.Errorf("ensure worker task stream: %w", err)
	}
	fsc, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	taskDef := taskscore.ImportUserJobDocumentsForAccount
	var published, errorsN int
	iter := fsc.Collection(firestoremig.FirestoreUsersCollection).Documents(ctx)
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("firestore iteration: %w", err)
		}
		aid := strings.TrimSpace(snap.Ref.ID)
		if aid == "" {
			continue
		}
		req := newImportUserJobDocumentTaskRequest(aid, skipAuthRecency)
		if err := eipnats.PublishTask(ctx, clients.NATS, taskDef.Subject, taskDef.Name, req, taskscore.Priority5); err != nil {
			logs.ErrorCtx(ctx, "import user job documents: publish task", "account_id", aid, "error", err)
			errorsN++
			continue
		}
		published++
	}
	if errorsN > 0 {
		return fmt.Errorf("enqueue had %d publication error(s); published=%d", errorsN, published)
	}
	if skipAuthRecency {
		fmt.Printf("Enqueued %d importUserJobDocumentsForAccount task(s) on %q (queue %q) with login recency disabled per task\n", published, taskDef.Subject, taskscore.Priority5)
	} else {
		fmt.Printf("Enqueued %d importUserJobDocumentsForAccount task(s) on %q (queue %q) (login recency in worker, default window %v)\n", published, taskDef.Subject, taskscore.Priority5, firebaseadmin.DefaultRecencyForActiveAccounts)
	}
	return nil
}

// newImportUserJobDocumentTaskRequest builds the worker payload. skipAuthRecency means LoginRecencyMaxAgeSeconds = -1.
// Otherwise 0/omitted so the worker applies DefaultRecencyForActiveAccounts.
func newImportUserJobDocumentTaskRequest(accountID string, skipAuthRecency bool) eipnats.ImportUserJobDocumentsForAccountRequest {
	req := eipnats.ImportUserJobDocumentsForAccountRequest{AccountID: accountID}
	if skipAuthRecency {
		req.LoginRecencyMaxAgeSeconds = -1
	}
	return req
}

func publishImportUserJobDocumentTaskSingle(ctx context.Context, accountID string) error {
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.NATS)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)
	if err := eipnats.EnsureWorkerTaskStream(clients.NATS.JS()); err != nil {
		return fmt.Errorf("ensure worker task stream: %w", err)
	}
	fsc, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()

	snap, err := fsc.Collection(firestoremig.FirestoreUsersCollection).Doc(accountID).Get(ctx)
	if err != nil {
		return fmt.Errorf("get firestore user document: %w", err)
	}
	if !snap.Exists() {
		return fmt.Errorf("firestore %s/%s does not exist", firestoremig.FirestoreUsersCollection, accountID)
	}

	taskDef := taskscore.ImportUserJobDocumentsForAccount
	req := newImportUserJobDocumentTaskRequest(accountID, true)
	if err := eipnats.PublishTask(ctx, clients.NATS, taskDef.Subject, taskDef.Name, req, taskscore.Priority5); err != nil {
		return err
	}
	fmt.Printf("Enqueued 1 importUserJobDocumentsForAccount task for account %q on %q (queue %q)\n", accountID, taskDef.Subject, taskscore.Priority5)
	return nil
}

func dryRunImportUserJobDocumentsSingle(ctx context.Context, accountID string) error {
	fsc, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Mongo)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	refs, err := firestoremig.CollectReferenceJobIDsForUser(ctx, fsc, clients.Mongo, accountID)
	if err != nil {
		return err
	}
	if len(refs) == 0 {
		fmt.Printf("Dry-run: no job id references in JobSnapshot, GroupData, or Mongo user_job_groups for %q\n", accountID)
		return nil
	}
	nFound := 0
	for _, ref := range refs {
		d, err := firestoremig.FetchUserJobFirestoreData(ctx, fsc, accountID, ref)
		if err != nil {
			return err
		}
		if d != nil {
			nFound++
		}
	}
	fmt.Printf("Dry-run account %q: %d unique reference id(s), %d job document(s) in Firestore, %d would be copied\n",
		accountID, len(refs), nFound, nFound)
	return nil
}

func dryRunImportUserJobDocumentsScanAll(ctx context.Context) error {
	fsc, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("firestore client: %w", err)
	}
	defer func() { _ = firebaseadmin.Close(ctx) }()
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Mongo)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	var refTotal, wouldCopy int
	iter := fsc.Collection(firestoremig.FirestoreUsersCollection).Documents(ctx)
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("firestore iteration: %w", err)
		}
		aid := snap.Ref.ID
		if aid == "" {
			continue
		}
		refs, err := firestoremig.CollectReferenceJobIDsForUser(ctx, fsc, clients.Mongo, aid)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				continue
			}
			return fmt.Errorf("account %q: %w", aid, err)
		}
		if len(refs) == 0 {
			continue
		}
		for _, ref := range refs {
			refTotal++
			d, err := firestoremig.FetchUserJobFirestoreData(ctx, fsc, aid, ref)
			if err != nil {
				return err
			}
			if d != nil {
				wouldCopy++
			}
		}
	}
	fmt.Printf("Dry-run: %d (account,ref) pairs; %d Firestore job body(ies) found (stale references skipped in real import)\n", refTotal, wouldCopy)
	return nil
}

func importUserJobDocumentsSingleWrite(ctx context.Context, fsc *firestore.Client, mc *eipmongo.Mongo, accountID string) error {
	imp, miss, fail, lerr := firestoremig.ImportAllReferencedUserJobDocumentsForAccount(ctx, fsc, mc, accountID)
	fmt.Printf("User job documents for %q: imported=%d, missing Firestore doc (skipped)=%d, failed=%d\n", accountID, imp, miss, fail)
	if lerr != nil {
		return lerr
	}
	return nil
}

func importUserJobDocumentsScanAllWrite(ctx context.Context, fsc *firestore.Client, mc *eipmongo.Mongo) error {
	var totImp, totMiss, totFail, acctErr int
	iter := fsc.Collection(firestoremig.FirestoreUsersCollection).Documents(ctx)
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("firestore iteration: %w", err)
		}
		aid := snap.Ref.ID
		if aid == "" {
			continue
		}
		imp, miss, fail, lerr := firestoremig.ImportAllReferencedUserJobDocumentsForAccount(ctx, fsc, mc, aid)
		if lerr != nil {
			logs.ErrorCtx(ctx, "import user job documents", "account_id", aid, "error", lerr)
			acctErr++
			totImp += imp
			totMiss += miss
			totFail += fail
			continue
		}
		totImp += imp
		totMiss += miss
		totFail += fail
	}
	if acctErr > 0 {
		return fmt.Errorf("%d account(s) had errors; totals: imported=%d, missing_in_firestore=%d, failed_job=%d", acctErr, totImp, totMiss, totFail)
	}
	fmt.Printf("All accounts: user_job_documents imported=%d, skipped missing Firestore job=%d, failed parse/upsert=%d\n", totImp, totMiss, totFail)
	return nil
}
