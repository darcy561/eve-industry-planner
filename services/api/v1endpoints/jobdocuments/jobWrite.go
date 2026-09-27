package jobdocuments

import (
	"fmt"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// decodeJobWrite reads the job a write carries.
func decodeJobWrite(body models.JobWriteBody) (*models.Job, error) {
	var job models.Job
	if err := jsoncodec.UnmarshalRequest(body.Document, &job); err != nil {
		return nil, fmt.Errorf("job write: %s carries a document this model cannot read: %w", body.JobID, err)
	}
	job.JobID = body.JobID
	job.SchemaVersion = models.JobSchemaCurrent
	return &job, nil
}

// fieldWriteFor turns one write into the fields and rows it changes.
func fieldWriteFor(body models.JobWriteBody, job *models.Job) (eipmongo.JobFieldWrite, error) {
	fields, err := models.JobSetPaths(body.Document, job)
	if err != nil {
		return eipmongo.JobFieldWrite{}, err
	}
	cleared, err := models.JobUnsetPaths(body.Removed)
	if err != nil {
		return eipmongo.JobFieldWrite{}, err
	}
	fields[models.JobSchemaVersionPath] = models.JobSchemaCurrent

	return eipmongo.JobFieldWrite{
		JobID:    body.JobID,
		Expected: body.Revision,
		Fields:   fields,
		Cleared:  cleared,
	}, nil
}

// readJobWrite is one write and the job it carries, held together so a dropped
// write cannot pair the rest with the wrong job.
type readJobWrite struct {
	Body models.JobWriteBody
	Job  models.Job
}

// splitJobWrites sorts each write into the way it has to be made, and names the
// ones that cannot be made at all.
func splitJobWrites(read []readJobWrite) (whole []models.Job, fields []eipmongo.JobFieldWrite, failed []string) {
	for i := range read {
		if read[i].Body.IsWholeDocument() {
			whole = append(whole, read[i].Job)
			continue
		}
		write, err := fieldWriteFor(read[i].Body, &read[i].Job)
		if err != nil {
			failed = append(failed, read[i].Body.JobID)
			continue
		}
		fields = append(fields, write)
	}
	return whole, fields, failed
}

// writtenIDs names the writes in sent that neither failed nor were refused.
func writtenIDs[T any](sent []T, idOf func(T) string, failed []string, conflicts []eipmongo.RevisionConflict) []string {
	missed := make(map[string]struct{}, len(failed)+len(conflicts))
	for _, jobID := range failed {
		missed[jobID] = struct{}{}
	}
	for _, conflict := range conflicts {
		missed[conflict.JobID] = struct{}{}
	}

	written := make([]string, 0, len(sent))
	for _, item := range sent {
		jobID := idOf(item)
		if jobID == "" {
			continue
		}
		if _, refused := missed[jobID]; refused {
			continue
		}
		written = append(written, jobID)
	}
	return written
}
