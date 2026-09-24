package mongo

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"eve-industry-planner/shared/models"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// SetFieldsWithRevision is the update for a write that carries only the fields
// it changed, and counts itself.
//
// It is [SetDocumentWithRevision]'s counterpart for a partial write: the same
// `_meta` handling — set field by field, the revision left to $inc alone,
// because Mongo refuses to $set a subdocument and $inc a path inside it — over
// paths the caller derived rather than over a whole document.
//
// stamp is what this write records about the document itself, as `_meta` paths
// — see [JobWriteStamp]. It is stated rather than derived from a meta struct,
// because a struct built for one write carries a zero value for every field it
// does not mean to set, and `_meta.createdAt` has no omitempty to save it.
//
// It is the server's own statement about the write, not anything the request
// carried, and it is the last thing copied in — so it is trusted, and nothing
// derived from a body belongs in it.
//
// fields and cleared are stored paths, already resolved from the job model. Any
// two of them that reach into one another are refused here rather than sent,
// whichever they came from: a stored document rejects an update naming the same
// ground twice, and it rejects the whole update rather than the offending half,
// so the write would be lost to an error naming neither path.
//
// The client works the same ground out for itself, over json names and before
// the model has resolved anything. This is a second answer to the same question
// from the paths that are actually sent, not a copy of that one — and it is the
// only one that can see what promotion and the bson tags did.
func SetFieldsWithRevision(fields map[string]any, cleared []string, stamp bson.M) (bson.M, error) {
	if err := refuseOverlappingPaths(fields, cleared); err != nil {
		return nil, err
	}

	set := bson.M{}
	maps.Copy(set, fields)
	maps.Copy(set, stamp)

	unset := bson.M{}
	for _, path := range cleared {
		unset[path] = ""
	}
	return revisionUpdate(set, unset), nil
}

// revisionUpdate is the update a write makes once its fields are worked out:
// what it sets, what it clears, and the count it adds one to.
//
// The counter is incremented rather than set, because a write states what the
// document now holds and not how many writes it has taken.
func revisionUpdate(set, unset bson.M) bson.M {
	update := bson.M{
		"$set": set,
		"$inc": bson.M{FieldMetaRevision: 1},
	}
	if len(unset) > 0 {
		update["$unset"] = unset
	}
	return update
}

func refuseOverlappingPaths(fields map[string]any, cleared []string) error {
	named := make([]string, 0, len(fields)+len(cleared))
	for field := range fields {
		// `_meta` is the server's to state, and a path reaching into it would be
		// quietly replaced by what this write stamps there.
		if pathReaches(metaField, field) {
			return fmt.Errorf("job write: %q is not a path a write may carry", field)
		}
		named = append(named, field)
	}
	for _, path := range cleared {
		if pathReaches(metaField, path) {
			return fmt.Errorf("job write: %q is not a path a write may clear", path)
		}
		named = append(named, path)
	}

	// Ordered by their steps rather than as strings, anything sorting between a
	// path and a path inside it shares the first as a prefix too — so an overlap
	// anywhere in the set is an overlap between neighbours, and neighbours are
	// the only pair worth asking about. Ordered as strings that does not hold: a
	// row key may hold a character below `.`, and `34-old` then sorts between
	// `34` and `34.quantity`.
	steps := make([][]string, 0, len(named))
	for _, path := range named {
		steps = append(steps, strings.Split(path, "."))
	}
	slices.SortFunc(steps, slices.Compare)

	for i := 1; i < len(steps); i++ {
		if stepsReach(steps[i-1], steps[i]) {
			return fmt.Errorf(
				"job write: %q and %q name the same ground",
				strings.Join(steps[i-1], "."), strings.Join(steps[i], "."),
			)
		}
	}
	return nil
}

// stepsReach reports whether writing outer also writes inner, the two being the
// same path included.
func stepsReach(outer, inner []string) bool {
	if len(outer) > len(inner) {
		return false
	}
	return slices.Equal(outer, inner[:len(outer)])
}

// pathReaches reports whether writing outer also writes inner, which includes
// the two being the same path.
func pathReaches(outer, inner string) bool {
	return outer == inner || strings.HasPrefix(inner, outer+".")
}

// JobWriteStamp is what a write records about the document it touched: when it
// happened, who made it, which planner the document belongs to, and which tab
// and session wrote it so the change stream can suppress its own echo.
//
// It names only those, so a field-scoped write leaves alone everything about
// the document it was not making a statement about — when the document was
// created, and whether it has been archived or deleted.
func JobWriteStamp(owner models.Owner, accountID string, now time.Time, sessionID, wsClientID string) bson.M {
	meta := models.MetaData{LastModified: now, Owner: owner}
	ApplyMetaSessionClient(&meta, sessionID, wsClientID)

	stamp := MetaSetByPath(meta)
	stamp[metaField+"."+models.MetaFieldLastUpdatedBy] = accountID
	return stamp
}

// JobFieldWrite is one job's write, carrying the fields it changed rather than
// the document those fields sit in.
//
// Expected is the revision the writer read the document at, and it is required:
// a write of some fields into a document that is not there would store a job
// made only of those fields. A job with no stored copy behind it is a create,
// and a create carries its whole document through [Docs.BulkUpsertJobs].
type JobFieldWrite struct {
	JobID    string
	Expected int64
	Fields   map[string]any
	Cleared  []string
}

// planJobFieldWrites turns each write into the update it makes, and names the
// jobs it could not.
//
// A job is dropped rather than failing the batch, the way an invalid job is in
// [Docs.BulkUpsertJobs]: one job the caller got wrong does not cost every other
// job in the same save.
func planJobFieldWrites(owner models.Owner, accountID string, writes []JobFieldWrite, now time.Time, sessionID, wsClientID string) ([]conditionalJobWrite, []string) {
	planned := make([]conditionalJobWrite, 0, len(writes))
	var failed []string

	for _, write := range writes {
		if write.JobID == "" || write.Expected <= 0 {
			failed = append(failed, write.JobID)
			continue
		}
		update, err := SetFieldsWithRevision(
			write.Fields,
			write.Cleared,
			JobWriteStamp(owner, accountID, now, sessionID, wsClientID),
		)
		if err != nil {
			failed = append(failed, write.JobID)
			continue
		}
		planned = append(planned, conditionalJobWrite{write.JobID, write.Expected, update})
	}
	return planned, failed
}

// BulkUpsertJobFields writes each job's changed fields, each conditional on the
// revision its writer read.
//
// Every write here is conditional, so none of them upserts: a document that has
// moved is reported in conflicts and the rest of the batch still lands, as in
// [Docs.BulkUpsertJobs].
func (d *Docs) BulkUpsertJobFields(ctx context.Context, owner models.Owner, accountID string, writes []JobFieldWrite, now time.Time, sessionID, wsClientID string) (int64, []string, []RevisionConflict, error) {
	if _, err := d.requireColl(); err != nil || accountID == "" || owner.IsZero() {
		return 0, nil, nil, fmt.Errorf("BulkUpsertJobFields: invalid arguments")
	}

	planned, failed := planJobFieldWrites(owner, accountID, writes, now, sessionID, wsClientID)
	conflicts, applied, err := d.applyConditionalWrites(ctx, owner, planned)
	if err != nil {
		return 0, failed, nil, err
	}
	return applied, failed, conflicts, nil
}
