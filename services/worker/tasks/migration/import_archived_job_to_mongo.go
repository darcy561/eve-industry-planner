package migration

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"eve-industry-planner/shared/archiveimport"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const importArchivedJobActor = "worker:importArchivedJobToMongo"

// ImportArchivedJobToMongo parses one Firestore ArchivedJobs payload, normalises it to [models.Job], and upserts into the archivedJobs Mongo collection.
// On any failure it returns a non-nil error so asynq marks the task failed (and logs retain context for review).
func ImportArchivedJobToMongo(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	req, err := esitasks.UnmarshalTaskPayload[natscore.ImportArchivedJobToMongoRequest](task)
	if err != nil {
		logs.ErrorCtx(ctx, "import archived job: invalid task payload",
			"error", err,
			"task_type", task.Type(),
			"payload_len", len(task.Payload()),
		)
		return fmt.Errorf("invalid task data: %w", err)
	}

	if req.UserID == "" {
		err := fmt.Errorf("user_id is required")
		logs.ErrorCtx(ctx, "import archived job: validation failed",
			"firestore_path", req.FirestorePath,
			"firestore_document_id", req.FirestoreDocumentID,
			"error", err,
		)
		return err
	}

	bv, err := archiveimport.ResolveCanonicalBuildVer(req.CanonicalBuildVer, "")
	if err != nil {
		logs.ErrorCtx(ctx, "import archived job: resolve canonical build version",
			"firestore_path", req.FirestorePath,
			"firestore_document_id", req.FirestoreDocumentID,
			"user_id", req.UserID,
			"payload_canonical_build_ver", req.CanonicalBuildVer,
			"error", err,
		)
		return fmt.Errorf("resolve canonical build version: %w", err)
	}

	baseFields := []any{
		"firestore_path", req.FirestorePath,
		"firestore_document_id", req.FirestoreDocumentID,
		"user_id", req.UserID,
		"canonical_build_ver", bv,
		"payload_canonical_build_ver_override", req.CanonicalBuildVer,
		"raw_data_len", len(req.RawData),
	}

	logs.InfoCtx(ctx, "import archived job: started", append(baseFields,
		"payload_type", task.Type(),
	)...)
	if len(req.RawData) == 0 {
		err := fmt.Errorf("raw_data is empty")
		logs.ErrorCtx(ctx, "import archived job: validation failed", append(baseFields, "error", err.Error())...)
		return err
	}

	var data map[string]any
	if err := json.Unmarshal(req.RawData, &data); err != nil {
		logs.ErrorCtx(ctx, "import archived job: json unmarshal raw_data failed",
			append(baseFields,
				"error", err,
				"raw_data_prefix", truncateForLog(string(req.RawData), 512),
			)...,
		)
		return fmt.Errorf("unmarshal raw_data: %w", err)
	}

	job, err := archiveimport.JobFromFirestoreMap(data, req.UserID)
	if err != nil {
		rawJobID, _ := data["jobID"]
		logs.ErrorCtx(ctx, "import archived job: JobFromFirestoreMap failed",
			append(baseFields,
				"error", err,
				"raw_job_id", rawJobID,
				"data_keys", mapKeysSample(data, 40),
			)...,
		)
		return fmt.Errorf("normalize job from firestore: %w", err)
	}

	if job.JobID == "" {
		err := fmt.Errorf("normalized job has empty jobID")
		logs.ErrorCtx(ctx, "import archived job: validation failed", append(baseFields, "error", err.Error())...)
		return err
	}
	if job.MetaData.AccountID == "" {
		err := fmt.Errorf("normalized job has empty _meta.accountID (jobID=%s)", job.JobID)
		logs.ErrorCtx(ctx, "import archived job: validation failed", append(baseFields, "job_id", job.JobID, "error", err.Error())...)
		return err
	}
	if job.MetaData.AccountID != req.UserID {
		err := fmt.Errorf("_meta.accountID %q does not match import user_id %q (jobID=%s)", job.MetaData.AccountID, req.UserID, job.JobID)
		logs.ErrorCtx(ctx, "import archived job: validation failed", append(baseFields, "job_id", job.JobID, "error", err.Error())...)
		return err
	}

	now := time.Now().UTC()
	job.MetaData.LastModified = now
	job.MetaData.LastUpdatedBy = importArchivedJobActor

	collection := deps.Mongo.ArchivedJobs.Collection()
	op := mongo.NewUpdateOneModel().
		SetFilter(bson.M{"_id": job.JobID, "_meta.accountID": job.MetaData.AccountID}).
		SetUpdate(bson.M{"$set": job, "$unset": eipmongo.ArchivedJobsUpsertUnset}).
		SetUpsert(true)

	var result *mongo.BulkWriteResult
	err = eipmongo.Retry(ctx, fmt.Sprintf("import archived job %s", job.JobID), func() error {
		var e error
		result, e = collection.BulkWrite(ctx, []mongo.WriteModel{op}, options.BulkWrite().SetOrdered(false))
		return e
	})
	if err != nil {
		logs.ErrorCtx(ctx, "import archived job: mongo BulkWrite failed",
			"firestore_path", req.FirestorePath,
			"firestore_document_id", req.FirestoreDocumentID,
			"user_id", req.UserID,
			"job_id", job.JobID,
			"account_id", job.MetaData.AccountID,
			"error", err,
		)
		return fmt.Errorf("mongo upsert job %q: %w", job.JobID, err)
	}

	logs.InfoCtx(ctx, "import archived job: success",
		"firestore_path", req.FirestorePath,
		"firestore_document_id", req.FirestoreDocumentID,
		"user_id", req.UserID,
		"job_id", job.JobID,
		"account_id", job.MetaData.AccountID,
		"upserted", result.UpsertedCount,
		"modified", result.ModifiedCount,
		"matched", result.MatchedCount,
	)
	return nil
}

func truncateForLog(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func mapKeysSample(m map[string]any, max int) []string {
	if len(m) == 0 {
		return nil
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) > max {
		keys = keys[:max]
	}
	return keys
}
