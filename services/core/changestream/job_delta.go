package changestream

import (
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// jobDelta is what a job document's update set and cleared, in the names a client
// reads, with the pair of revisions it moves between.
type jobDelta struct {
	Changed   []models.JobJSONChange
	Removed   [][]string
	Revision  int64
	AppliesTo int64
}

// jobDeltaFor states an update's delta from the event alone, answering false
// wherever it cannot and the whole document has to carry the change.
func jobDeltaFor(updateDescription bson.M) (jobDelta, bool) {
	if updateDescription == nil || len(entriesOf(updateDescription["truncatedArrays"])) > 0 {
		return jobDelta{}, false
	}

	updatedFields := subDocumentToMap(updateDescription["updatedFields"])
	revision, written := revisionWritten(updatedFields)
	if !written || revision < 1 {
		return jobDelta{}, false
	}

	changed, err := models.JobJSONChanges(updatedFields)
	if err != nil {
		return jobDelta{}, false
	}

	names, readable := removedFieldNames(updateDescription["removedFields"])
	if !readable {
		return jobDelta{}, false
	}
	removed, err := models.JobJSONRemoved(names)
	if err != nil {
		return jobDelta{}, false
	}

	return jobDelta{
		Changed:   changed,
		Removed:   removed,
		Revision:  revision,
		AppliesTo: revision - 1,
	}, true
}

// revisionWritten reads the write counter this update itself set, answering false
// for an update that did not move it.
func revisionWritten(updatedFields bson.M) (int64, bool) {
	if held, ok := counterValue(updatedFields[models.MetaFieldName+"."+models.MetaFieldRevision]); ok {
		return held, true
	}
	meta := subDocumentToMap(updatedFields[models.MetaFieldName])
	if meta == nil {
		return 0, false
	}
	return counterValue(meta[models.MetaFieldRevision])
}

func counterValue(raw any) (int64, bool) {
	switch v := raw.(type) {
	case int64:
		return v, true
	case int32:
		return int64(v), true
	case float64:
		return int64(v), true
	default:
		return 0, false
	}
}

// removedFieldNames reads the stored paths an update cleared, answering false for
// an entry that is not a path rather than dropping it.
func removedFieldNames(raw any) ([]string, bool) {
	held := entriesOf(raw)
	names := make([]string, 0, len(held))
	for _, entry := range held {
		name, ok := entry.(string)
		if !ok || name == "" {
			return nil, false
		}
		names = append(names, name)
	}
	return names, true
}

func entriesOf(raw any) []any {
	switch v := raw.(type) {
	case bson.A:
		return v
	case []any:
		return v
	default:
		return nil
	}
}
