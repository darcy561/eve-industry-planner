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

// JobWriteStamp is what a write records about the document it touched: when, by
// whom, in which planner, and from which tab and session.
func JobWriteStamp(owner models.Owner, accountID string, now time.Time, sessionID, wsClientID string) bson.M {
	meta := models.MetaData{LastModified: now, Owner: owner}
	ApplyMetaSessionClient(&meta, sessionID, wsClientID)

	stamp := MetaSetByPath(meta)
	stamp[metaField+"."+models.MetaFieldLastUpdatedBy] = accountID
	return stamp
}

// JobFieldWrite is one job's write, carrying the fields it changed rather than
// the document those fields sit in.
type JobFieldWrite struct {
	JobID    string
	Expected int64
	Fields   map[string]any
	Cleared  []string
}

// planJobFieldWrites turns each write into the update it makes, and names the
// jobs it could not.
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
