package mongo

import "go.mongodb.org/mongo-driver/v2/bson"

// ArchivedJobsUpsertUnset clears root-level ownership/lifecycle keys on archivedJobs upserts.
// Those fields belong under _meta only; $set with models.Job does not touch the roots, so
// leftover root values would otherwise remain.
var ArchivedJobsUpsertUnset = bson.M{
	"accountID":        "",
	"archiveProcessed": "",
	"archived":         "",
	"archiveTimeStamp": "",
	"deleted":          "",
	"deletedTimeStamp": "",
}

// UserJobDocumentsUpsertUnset clears the same root-level keys on user_job_documents upserts
// (PUT /api/v1/job-documents).
var UserJobDocumentsUpsertUnset = bson.M{
	"accountID":        "",
	"archived":         "",
	"archiveTimeStamp": "",
	"archiveProcessed": "",
	"deleted":          "",
	"deletedTimeStamp": "",
}
