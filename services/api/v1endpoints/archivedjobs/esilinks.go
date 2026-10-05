package archivedjobs

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// esiLinkKind names an ESI series. Ids do not compare across kinds: an order and
// a transaction id may collide numerically.
type esiLinkKind string

const (
	esiLinkOrder       esiLinkKind = "order"
	esiLinkJob         esiLinkKind = "job"
	esiLinkTransaction esiLinkKind = "transaction"
)

// esiLinkRow is where one kind's rows sit on a job, keyed by the ESI id each holds, and how a job's
// ids of that kind are read and one of its rows dropped.
type esiLinkRow struct {
	path       []string
	accountKey string
	held       func(models.Job) []int64
	drop       func(*models.Job, string)
}

// esiLinkRows is every kind of ESI row a job holds.
var esiLinkRows = map[esiLinkKind]esiLinkRow{
	esiLinkOrder: {
		path:       []string{"esi", "marketOrders"},
		accountKey: "linkedOrders",
		held:       models.Job.LinkedOrderIDs,
		drop:       func(job *models.Job, id string) { delete(job.ESI.MarketOrders, id) },
	},
	esiLinkJob: {
		path:       []string{"esi", "industryJobs"},
		accountKey: "linkedJobs",
		held:       models.Job.LinkedESIJobIDs,
		drop:       func(job *models.Job, id string) { delete(job.ESI.LinkedJobs, id) },
	},
	esiLinkTransaction: {
		path:       []string{"esi", "transactions"},
		accountKey: "linkedTrans",
		held:       models.Job.LinkedTransactionIDs,
		drop:       func(job *models.Job, id string) { delete(job.ESI.Transactions, id) },
	},
}

// esiConflict is one ESI entry a restored job cannot reclaim, and the planner
// job now holding it.
type esiConflict struct {
	Kind       esiLinkKind `json:"kind"`
	ID         int64       `json:"id"`
	HeldBy     string      `json:"heldBy"`
	HeldByName string      `json:"heldByName,omitempty"`
}

// esiLinkSet is a set of ESI ids split by kind.
type esiLinkSet map[esiLinkKind][]int64

// esiLinksOf reads a job's own ESI ids.
func esiLinksOf(job *models.Job) esiLinkSet {
	set := esiLinkSet{}
	if job == nil {
		return set
	}
	for kind, rows := range esiLinkRows {
		if held := rows.held(*job); len(held) > 0 {
			set[kind] = held
		}
	}
	return set
}

func (s esiLinkSet) merge(other esiLinkSet) esiLinkSet {
	for kind, ids := range other {
		s[kind] = append(s[kind], ids...)
	}
	return s
}

func (s esiLinkSet) empty() bool {
	for _, ids := range s {
		if len(ids) > 0 {
			return false
		}
	}
	return true
}

// esiHolder is a planner job claiming an ESI id.
type esiHolder struct {
	JobID string `bson:"jobID"`
	Name  string `bson:"name"`
}

// resolveESILinks splits ESI ids into those free to reclaim and those a planner
// job holds. Jobs being restored together are excluded from the search.
func resolveESILinks(ctx context.Context, m *eipmongo.Mongo, accountID string, links esiLinkSet, restoringJobIDs []string) (esiLinkSet, []esiConflict, error) {
	if m == nil || m.JobDocuments == nil {
		return esiLinkSet{}, nil, fmt.Errorf("mongo handle is required")
	}
	if links.empty() {
		return esiLinkSet{}, nil, nil
	}

	free := esiLinkSet{}
	var conflicts []esiConflict
	for _, kind := range slices.Sorted(maps.Keys(links)) {
		ids := links[kind]
		if len(ids) == 0 {
			continue
		}
		holders, err := esiHoldersFor(ctx, m, accountID, kind, ids, restoringJobIDs)
		if err != nil {
			return esiLinkSet{}, nil, err
		}
		for _, id := range ids {
			if holder, taken := holders[id]; taken {
				conflicts = append(conflicts, esiConflict{
					Kind:       kind,
					ID:         id,
					HeldBy:     holder.JobID,
					HeldByName: holder.Name,
				})
				continue
			}
			free[kind] = append(free[kind], id)
		}
	}
	return free, conflicts, nil
}

// esiHolderQueryIDs bounds how many ids one holder query names.
const esiHolderQueryIDs = 500

// esiHoldersFor finds which planner job holds each id, querying a kind's rows by id key in bounded
// batches.
func esiHoldersFor(ctx context.Context, m *eipmongo.Mongo, accountID string, kind esiLinkKind, ids []int64, excludeJobIDs []string) (map[int64]esiHolder, error) {
	rows, ok := esiLinkRows[kind]
	if !ok {
		return nil, fmt.Errorf("unknown esi link kind %q", kind)
	}
	coll := m.JobDocuments.Collection()
	if coll == nil {
		return nil, fmt.Errorf("job documents collection is required")
	}
	rowPath, err := models.JobRowPath(append(slices.Clone(rows.path), "0"))
	if err != nil {
		return nil, err
	}
	field := strings.TrimSuffix(rowPath, ".0")

	wanted := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		wanted[id] = struct{}{}
	}
	out := map[int64]esiHolder{}
	for batch := range slices.Chunk(ids, esiHolderQueryIDs) {
		held := make(bson.A, 0, len(batch))
		for _, id := range batch {
			held = append(held, bson.M{field + "." + strconv.FormatInt(id, 10): bson.M{"$exists": true}})
		}
		filter := eipmongo.OwnerFilter(models.AccountOwner(accountID), bson.M{"$or": held})
		if len(excludeJobIDs) > 0 {
			filter["jobID"] = bson.M{"$nin": excludeJobIDs}
		}
		var found []models.Job
		if err := eipmongo.Retry(ctx, "resolve esi link holders", func() error {
			cursor, findErr := coll.Find(ctx, filter, options.Find().SetProjection(bson.M{"jobID": 1, "name": 1, field: 1}))
			if findErr != nil {
				return findErr
			}
			defer cursor.Close(ctx)
			found = nil
			return cursor.All(ctx, &found)
		}); err != nil {
			return nil, err
		}
		for _, row := range found {
			for _, id := range rows.held(row) {
				if _, asked := wanted[id]; !asked {
					continue
				}
				if _, already := out[id]; !already {
					out[id] = esiHolder{JobID: row.JobID, Name: row.Name}
				}
			}
		}
	}
	return out, nil
}

// applyESILinks adds reclaimed ids to the account's linked sets. $addToSet
// rather than read-modify-write, so concurrent linking cannot duplicate an id.
func applyESILinks(ctx context.Context, m *eipmongo.Mongo, accountID string, free esiLinkSet, now time.Time, sessionID, wsClientID string) error {
	if free.empty() {
		return nil
	}
	if m == nil || m.Users == nil {
		return fmt.Errorf("mongo handle is required")
	}
	coll := m.Users.Collection()
	if coll == nil {
		return fmt.Errorf("accounts collection is required")
	}

	addToSet := bson.M{}
	for kind, ids := range free {
		if len(ids) > 0 {
			addToSet[esiLinkRows[kind].accountKey] = bson.M{"$each": ids}
		}
	}

	set := eipmongo.MetaStamp(now, sessionID, wsClientID)

	return eipmongo.Retry(ctx, "relink esi ids", func() error {
		_, err := coll.UpdateOne(ctx,
			eipmongo.OwnerFilter(models.AccountOwner(accountID)),
			bson.M{
				"$addToSet": addToSet,
				"$set":      set,
			})
		return err
	})
}
