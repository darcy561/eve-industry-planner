package archivedjobs

import (
	"context"
	"fmt"
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
	path []string
	held func(models.Job) []int64
	drop func(*models.Job, string)
}

// esiLinkRows is every kind of ESI row a job holds.
var esiLinkRows = map[esiLinkKind]esiLinkRow{
	esiLinkOrder: {
		path: []string{"esi", "marketOrders"},
		held: models.Job.LinkedOrderIDs,
		drop: func(job *models.Job, id string) { delete(job.ESI.MarketOrders, id) },
	},
	esiLinkJob: {
		path: []string{"esi", "industryJobs"},
		held: models.Job.LinkedESIJobIDs,
		drop: func(job *models.Job, id string) { delete(job.ESI.LinkedJobs, id) },
	},
	esiLinkTransaction: {
		path: []string{"esi", "transactions"},
		held: models.Job.LinkedTransactionIDs,
		drop: func(job *models.Job, id string) { delete(job.ESI.Transactions, id) },
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
type esiLinkSet struct {
	Orders       []int64
	Jobs         []int64
	Transactions []int64
}

// esiLinksOf reads a job's own ESI ids.
func esiLinksOf(job *models.Job) esiLinkSet {
	if job == nil {
		return esiLinkSet{}
	}
	return esiLinkSet{
		Orders:       job.LinkedOrderIDs(),
		Jobs:         job.LinkedESIJobIDs(),
		Transactions: job.LinkedTransactionIDs(),
	}
}

func (s esiLinkSet) merge(other esiLinkSet) esiLinkSet {
	s.Orders = append(s.Orders, other.Orders...)
	s.Jobs = append(s.Jobs, other.Jobs...)
	s.Transactions = append(s.Transactions, other.Transactions...)
	return s
}

func (s esiLinkSet) empty() bool {
	return len(s.Orders) == 0 && len(s.Jobs) == 0 && len(s.Transactions) == 0
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

	excluded := make([]string, 0, len(restoringJobIDs))
	excluded = append(excluded, restoringJobIDs...)

	free := esiLinkSet{}
	var conflicts []esiConflict

	for _, group := range []struct {
		kind esiLinkKind
		ids  []int64
		out  *[]int64
	}{
		{esiLinkOrder, links.Orders, &free.Orders},
		{esiLinkJob, links.Jobs, &free.Jobs},
		{esiLinkTransaction, links.Transactions, &free.Transactions},
	} {
		if len(group.ids) == 0 {
			continue
		}
		holders, err := esiHoldersFor(ctx, m, accountID, group.kind, group.ids, excluded)
		if err != nil {
			return esiLinkSet{}, nil, err
		}
		for _, id := range group.ids {
			if holder, taken := holders[id]; taken {
				conflicts = append(conflicts, esiConflict{
					Kind:       group.kind,
					ID:         id,
					HeldBy:     holder.JobID,
					HeldByName: holder.Name,
				})
				continue
			}
			*group.out = append(*group.out, id)
		}
	}
	return free, conflicts, nil
}

// esiHoldersFor finds which planner job holds each id, one query per kind.
func esiHoldersFor(ctx context.Context, m *eipmongo.Mongo, accountID string, kind esiLinkKind, ids []int64, excludeJobIDs []string) (map[int64]esiHolder, error) {
	rows, ok := esiLinkRows[kind]
	if !ok {
		return nil, fmt.Errorf("unknown esi link kind %q", kind)
	}
	coll := m.JobDocuments.Collection()
	if coll == nil {
		return nil, fmt.Errorf("job documents collection is required")
	}

	held := make(bson.A, 0, len(ids))
	var field string
	for _, id := range ids {
		key := strconv.FormatInt(id, 10)
		path, err := models.JobRowPath(append(slices.Clone(rows.path), key))
		if err != nil {
			return nil, err
		}
		field = strings.TrimSuffix(path, "."+key)
		held = append(held, bson.M{path: bson.M{"$exists": true}})
	}
	filter := eipmongo.OwnerFilter(models.AccountOwner(accountID), bson.M{"$or": held})
	if len(excludeJobIDs) > 0 {
		filter["jobID"] = bson.M{"$nin": excludeJobIDs}
	}

	out := map[int64]esiHolder{}
	err := eipmongo.Retry(ctx, "resolve esi link holders", func() error {
		clear(out)
		cursor, findErr := coll.Find(ctx, filter, options.Find().SetProjection(bson.M{
			"jobID": 1,
			"name":  1,
			field:   1,
		}))
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)

		wanted := make(map[int64]struct{}, len(ids))
		for _, id := range ids {
			wanted[id] = struct{}{}
		}

		var found []models.Job
		if allErr := cursor.All(ctx, &found); allErr != nil {
			return allErr
		}
		for _, row := range found {
			for _, id := range rows.held(row) {
				if _, asked := wanted[id]; !asked {
					continue
				}
				if _, already := out[id]; already {
					continue
				}
				out[id] = esiHolder{JobID: row.JobID, Name: row.Name}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
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
	if len(free.Orders) > 0 {
		addToSet["linkedOrders"] = bson.M{"$each": free.Orders}
	}
	if len(free.Jobs) > 0 {
		addToSet["linkedJobs"] = bson.M{"$each": free.Jobs}
	}
	if len(free.Transactions) > 0 {
		addToSet["linkedTrans"] = bson.M{"$each": free.Transactions}
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
