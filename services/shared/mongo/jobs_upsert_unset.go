package mongo

import "go.mongodb.org/mongo-driver/v2/bson"

// ArchivedJobsUpsertUnset clears root-level ownership/lifecycle keys on archived_jobs upserts.
var ArchivedJobsUpsertUnset = bson.M{
	"accountID":        "",
	"archiveProcessed": "",
	"archived":         "",
	"archiveTimeStamp": "",
	"deleted":          "",
	"deletedTimeStamp": "",
}

// JobDocumentsUpsertUnset clears the same root-level keys on job_documents upserts
// (PUT /api/v1/job-documents).
var JobDocumentsUpsertUnset = bson.M{
	"accountID":        "",
	"archived":         "",
	"archiveTimeStamp": "",
	"archiveProcessed": "",
	"deleted":          "",
	"deletedTimeStamp": "",
}
