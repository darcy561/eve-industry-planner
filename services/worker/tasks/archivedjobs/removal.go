package archivedjobs

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	archivedjobshelpers "eve-industry-planner/worker/tasks/archivedjobs/helpers"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func loadArchivedJobSnapshotByID(ctx context.Context, corpColl, userColl *mongo.Collection, snapshotID string) (*models.ArchivedJobStats, error) {
	var doc models.ArchivedJobStats
	err := corpColl.FindOne(ctx, bson.M{"_id": snapshotID}).Decode(&doc)
	if err == nil {
		return &doc, nil
	}
	if err != mongo.ErrNoDocuments {
		return nil, err
	}
	err = userColl.FindOne(ctx, bson.M{"_id": snapshotID}).Decode(&doc)
	if err == nil {
		return &doc, nil
	}
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return nil, err
}

// RemoveAccountArchivedJob deletes one archivedJobs document and its snapshot rows (corp_archived_job_stats / user_archived_job_stats),
// then marks the account and implicated corp refs for aggregate rebuild. Intended for future restore/delete APIs.
func RemoveAccountArchivedJob(ctx context.Context, deps *esitasks.TaskDependencies, accountID, jobID string) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if accountID == "" || jobID == "" {
		return fmt.Errorf("account_id and job_id are required")
	}
	_, keyring, h, err := archivedjobshelpers.LoadPipelineCrypto()
	if err != nil {
		return err
	}

	db := deps.Mongo.Database(mongocore.DatabaseName)
	archived := db.Collection(mongocore.CollectionArchivedJobs)
	snapshotCollCorp := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	snapshotCollUser := db.Collection(mongocore.CollectionUserArchivedJobStats)
	dirtyAccountsColl := db.Collection(mongocore.CollectionUserBuildStatsDirtyAccounts)
	dirtyRefsColl := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs)

	snapshotID := mongocore.ArchivedJobStatsDocumentID(accountID, jobID)
	var refs []string
	doc, err := loadArchivedJobSnapshotByID(ctx, snapshotCollCorp, snapshotCollUser, snapshotID)
	if err != nil {
		return err
	}
	if doc != nil {
		refs = archivedjobshelpers.CorpRefsFromArchivedJobStatsDocs([]models.ArchivedJobStats{*doc}, keyring, h)
	}

	if _, err := archived.DeleteOne(ctx, bson.M{"_id": jobID, "_meta.accountID": accountID}); err != nil {
		return fmt.Errorf("delete archived job: %w", err)
	}
	_, _ = snapshotCollCorp.DeleteOne(ctx, bson.M{"_id": snapshotID})
	_, _ = snapshotCollUser.DeleteOne(ctx, bson.M{"_id": snapshotID})

	if err := archivedjobshelpers.MarkDirtyCorpRefs(ctx, dirtyRefsColl, refs); err != nil {
		return fmt.Errorf("mark dirty corp refs: %w", err)
	}
	if err := archivedjobshelpers.MarkDirtyAccountForRebuild(ctx, dirtyAccountsColl, accountID); err != nil {
		return fmt.Errorf("mark dirty account: %w", err)
	}
	logs.InfoCtx(ctx, "removed account archived job", "account_id", accountID, "job_id", jobID)
	return nil
}

// RemoveCorpArchivedJob deletes one corp_archivedJobs document and its snapshot rows, then marks implicated corp refs dirty.
// Does not touch user_build_stats_dirty_accounts (pure corp-owned rows have no account owner).
func RemoveCorpArchivedJob(ctx context.Context, deps *esitasks.TaskDependencies, corpRef, jobID string) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if corpRef == "" || jobID == "" {
		return fmt.Errorf("corp_ref and job_id are required")
	}
	_, keyring, h, err := archivedjobshelpers.LoadPipelineCrypto()
	if err != nil {
		return err
	}

	db := deps.Mongo.Database(mongocore.DatabaseName)
	corpArchived := db.Collection(mongocore.CollectionCorpArchivedJobs)
	snapshotCollCorp := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	snapshotCollUser := db.Collection(mongocore.CollectionUserArchivedJobStats)
	dirtyRefsColl := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs)

	snapshotID := mongocore.CorpOwnedArchivedJobStatsDocumentID(corpRef, jobID)
	var refs []string
	doc, err := loadArchivedJobSnapshotByID(ctx, snapshotCollCorp, snapshotCollUser, snapshotID)
	if err != nil {
		return err
	}
	if doc != nil {
		refs = archivedjobshelpers.CorpRefsFromArchivedJobStatsDocs([]models.ArchivedJobStats{*doc}, keyring, h)
	}

	if _, err := corpArchived.DeleteOne(ctx, bson.M{"_id": jobID, "_meta.corpRef": corpRef}); err != nil {
		return fmt.Errorf("delete corp archived job: %w", err)
	}
	_, _ = snapshotCollCorp.DeleteOne(ctx, bson.M{"_id": snapshotID})
	_, _ = snapshotCollUser.DeleteOne(ctx, bson.M{"_id": snapshotID})

	if err := archivedjobshelpers.MarkDirtyCorpRefs(ctx, dirtyRefsColl, refs); err != nil {
		return fmt.Errorf("mark dirty corp refs: %w", err)
	}
	logs.InfoCtx(ctx, "removed corp archived job", "corp_ref", corpRef, "job_id", jobID)
	return nil
}
