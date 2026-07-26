package firestoremig

import (
	"context"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/archiveimport"
	"eve-industry-planner/shared/models"

	"cloud.google.com/go/firestore"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	firestoreJobSnapshotDocID   = "JobSnapshot"
	firestoreJobSnapshotField   = "snapshot"
	firestoreUserJobsCollection = "Jobs" // also try "jobs" in fetch
	importLiveUserJobsActor     = "firestore-import:liveUserJobDocuments"
)

// JobSnapshotFirestoreRef is Users/{accountID}/ProfileInfo/JobSnapshot.
func JobSnapshotFirestoreRef(fs *firestore.Client, accountID string) *firestore.DocumentRef {
	return fs.Collection(FirestoreUsersCollection).Doc(accountID).Collection(firestoreProfileInfoSub).Doc(firestoreJobSnapshotDocID)
}

// UserJobFirestoreRef tries doc id; collection name "Jobs" then "jobs" on not found (legacy variance).
func UserJobFirestoreRef(fs *firestore.Client, accountID, jobDocID, collName string) *firestore.DocumentRef {
	return fs.Collection(FirestoreUsersCollection).Doc(accountID).Collection(collName).Doc(jobDocID)
}

// CollectReferenceJobIDsForUser unions job id references from:
// - Firestore ProfileInfo/JobSnapshot (snapshot[]: jobID + parent/child id hints),
// - Firestore ProfileInfo/GroupData (each group's includedJobIDs),
// - Mongo user_job_groups (IncludedJobIDs for the account).
func CollectReferenceJobIDsForUser(
	ctx context.Context,
	fs *firestore.Client,
	m *mongo.Client,
	accountID string,
) (ids []string, err error) {
	set := make(map[string]struct{})

	// 1) JobSnapshot
	snap, err := JobSnapshotFirestoreRef(fs, accountID).Get(ctx)
	if err != nil {
		if status.Code(err) != codes.NotFound {
			return nil, err
		}
	} else if snap != nil && snap.Exists() && snap.Data() != nil {
		for _, id := range jobIDsFromJobSnapshotData(snap.Data()) {
			addJobRef(set, id)
		}
	}

	// 2) GroupData in Firestore
	gd, err := GroupDataFirestoreRef(fs, accountID).Get(ctx)
	if err != nil {
		if status.Code(err) != codes.NotFound {
			return nil, err
		}
	} else if gd != nil && gd.Exists() && gd.Data() != nil {
		for _, id := range jobIDsFromGroupDataDoc(gd.Data()) {
			addJobRef(set, id)
		}
	}

	// 3) Migrated groups in Mongo
	if m != nil {
		extra, merr := jobIDsFromMongoUserJobGroups(ctx, m, accountID)
		if merr != nil {
			return nil, merr
		}
		for _, id := range extra {
			addJobRef(set, id)
		}
	}

	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	sort.Strings(out)
	return out, nil
}

func addJobRef(set map[string]struct{}, id string) {
	id = strings.TrimSpace(id)
	if id == "" || id == "<nil>" {
		return
	}
	set[id] = struct{}{}
}

func jobIDsFromJobSnapshotData(data map[string]any) []string {
	v, ok := data[firestoreJobSnapshotField]
	if !ok || v == nil {
		return nil
	}
	arr, ok := toAnySlice(v)
	if !ok {
		return nil
	}
	var out []string
	for _, el := range arr {
		m, ok := el.(map[string]any)
		if !ok {
			continue
		}
		for _, key := range []string{"jobID", "jobId"} {
			if s := JobIDStringFromFirestoreValue(m[key]); s != "" {
				out = append(out, s)
			}
		}
		for _, key := range []string{"parentJobs", "childJobs", "parentJob"} {
			out = append(out, stringSliceFromMixedIDArray(m[key])...)
		}
	}
	return out
}

func jobIDsFromGroupDataDoc(data map[string]any) []string {
	els := GroupDataArrayElements(data)
	if len(els) == 0 {
		return nil
	}
	var out []string
	for _, el := range els {
		m, ok := el.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, stringSliceFromMixedIDArray(m["includedJobIDs"])...)
	}
	return out
}

func stringSliceFromMixedIDArray(v any) []string {
	if v == nil {
		return nil
	}
	arr, ok := toAnySlice(v)
	if !ok {
		return nil
	}
	var out []string
	for _, el := range arr {
		if s := JobIDStringFromFirestoreValue(el); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func jobIDsFromMongoUserJobGroups(ctx context.Context, m *mongo.Client, accountID string) ([]string, error) {
	coll := m.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUserJobGroups)
	cur, err := coll.Find(ctx, bson.M{"_meta.accountID": accountID})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var all []string
	for cur.Next(ctx) {
		var g models.Group
		if err := cur.Decode(&g); err != nil {
			return nil, err
		}
		for _, jid := range g.IncludedJobIDs {
			jid = strings.TrimSpace(jid)
			if jid == "" || jid == "<nil>" {
				continue
			}
			all = append(all, jid)
		}
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}
	return all, nil
}

// toAnySlice accepts []any, []interface{} (Firestore), or any slice type via reflection.
func toAnySlice(v any) ([]any, bool) {
	if v == nil {
		return nil, false
	}
	switch t := v.(type) {
	case []any:
		return t, true
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Slice {
		return nil, false
	}
	n := rv.Len()
	out := make([]any, n)
	for i := 0; i < n; i++ {
		out[i] = rv.Index(i).Interface()
	}
	return out, true
}

// jobFirestoreDocIDCandidates returns possible Firestore document ids for a job reference.
func jobFirestoreDocIDCandidates(referencedID string) []string {
	referencedID = strings.TrimSpace(referencedID)
	if referencedID == "" {
		return nil
	}
	seen := make(map[string]struct{})
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		seen[s] = struct{}{}
	}
	add(referencedID)
	if !strings.HasPrefix(referencedID, "job-") {
		pref := archiveimport.EnsureJobIDPrefix(referencedID)
		add(pref)
	}
	// if reference had job- prefix, also try without (legacy store)
	if strings.HasPrefix(referencedID, "job-") {
		add(strings.TrimPrefix(referencedID, "job-"))
	}
	out := make([]string, 0, len(seen))
	for s := range seen {
		out = append(out, s)
	}
	// prefer shorter / exact reference first
	sort.Strings(out)
	return out
}

// FetchUserJobFirestoreData loads Users/{uid}/Jobs/{id} (or jobs/) — first existing candidate wins.
func FetchUserJobFirestoreData(ctx context.Context, fs *firestore.Client, accountID, referencedJobID string) (data map[string]any, err error) {
	cands := jobFirestoreDocIDCandidates(referencedJobID)
	if len(cands) == 0 {
		return nil, nil
	}
	for _, coll := range []string{firestoreUserJobsCollection, "jobs"} {
		for _, docID := range cands {
			snap, err := UserJobFirestoreRef(fs, accountID, docID, coll).Get(ctx)
			if err != nil {
				// Firestore returns NotFound for missing documents (see DocumentRef.Get docs).
				if status.Code(err) == codes.NotFound {
					continue
				}
				return nil, err
			}
			if snap != nil && snap.Exists() {
				return snap.Data(), nil
			}
		}
	}
	return nil, nil
}

// UpsertUserJobDocumentToMongo parses Firestore job map with archiveimport.JobFromFirestoreMap and upserts user_job_documents.
func UpsertUserJobDocumentToMongo(ctx context.Context, m *mongo.Client, accountID string, firestoreJob map[string]any) error {
	if m == nil {
		return fmt.Errorf("mongo client is required")
	}
	now := time.Now().UTC()
	job, err := archiveimport.JobFromFirestoreMap(firestoreJob, accountID)
	if err != nil {
		return err
	}
	if job.JobID == "" {
		return fmt.Errorf("normalized job has empty jobID")
	}
	if job.MetaData.AccountID == "" {
		return fmt.Errorf("normalized job has empty _meta.accountID")
	}
	if job.MetaData.AccountID != accountID {
		return fmt.Errorf("job _meta.accountID %q != %q", job.MetaData.AccountID, accountID)
	}
	job.MetaData.LastModified = now
	job.MetaData.LastUpdatedBy = importLiveUserJobsActor

	coll := m.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUserJobDocuments)
	op := mongo.NewUpdateOneModel().
		SetFilter(bson.M{"_id": job.JobID, "_meta.accountID": job.MetaData.AccountID}).
		SetUpdate(bson.M{"$set": job, "$unset": mongocore.UserJobDocumentsUpsertUnset}).
		SetUpsert(true)

	retry := mongocore.DefaultRetryConfig()
	retry.OperationName = fmt.Sprintf("import live user job document %s", job.JobID)
	return mongocore.RetryMongoOperation(ctx, retry, func() error {
		_, e := coll.BulkWrite(ctx, []mongo.WriteModel{op}, options.BulkWrite().SetOrdered(false))
		return e
	})
}

// ImportAllReferencedUserJobDocumentsForAccount loads each referenced id; skips missing Firestore documents.
// lastErr is set to the most recent upsert/parse error when failed > 0 (earlier errors are not preserved).
func ImportAllReferencedUserJobDocumentsForAccount(
	ctx context.Context,
	fs *firestore.Client,
	m *mongo.Client,
	accountID string,
) (imported, missingFS, failed int, lastErr error) {
	ids, err := CollectReferenceJobIDsForUser(ctx, fs, m, accountID)
	if err != nil {
		return 0, 0, 0, err
	}
	for _, ref := range ids {
		data, err := FetchUserJobFirestoreData(ctx, fs, accountID, ref)
		if err != nil {
			return imported, missingFS, failed, err
		}
		if data == nil {
			missingFS++
			continue
		}
		if uerr := UpsertUserJobDocumentToMongo(ctx, m, accountID, data); uerr != nil {
			failed++
			lastErr = fmt.Errorf("ref %q: %w", ref, uerr)
			continue
		}
		imported++
	}
	return imported, missingFS, failed, lastErr
}
