package archivedjobs

import (
	"context"
	"fmt"
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

// esiLinkField is where each kind's ids live on a job document. A job holds an
// ESI id by carrying the row itself, so the search reads the rows.
var esiLinkField = map[esiLinkKind]string{
	esiLinkOrder:       "build.sale.marketOrders.order_id",
	esiLinkJob:         "build.costs.linkedJobs.job_id",
	esiLinkTransaction: "build.sale.transactions.transaction_id",
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
	field, ok := esiLinkField[kind]
	if !ok {
		return nil, fmt.Errorf("unknown esi link kind %q", kind)
	}
	coll := m.JobDocuments.Collection()
	if coll == nil {
		return nil, fmt.Errorf("job documents collection is required")
	}

	filter := bson.M{
		"_meta.accountID": accountID,
		field:             bson.M{"$in": ids},
	}
	if len(excludeJobIDs) > 0 {
		filter["jobID"] = bson.M{"$nin": excludeJobIDs}
	}

	out := map[int64]esiHolder{}
	err := eipmongo.Retry(ctx, "resolve esi link holders", func() error {
		clear(out)
		cursor, findErr := coll.Find(ctx, filter, options.Find().SetProjection(bson.M{
			"jobID":                   1,
			"name":                    1,
			"build.costs.linkedJobs":  1,
			"build.sale.marketOrders": 1,
			"build.sale.transactions": 1,
		}))
		if findErr != nil {
			return findErr
		}
		defer cursor.Close(ctx)

		wanted := make(map[int64]struct{}, len(ids))
		for _, id := range ids {
			wanted[id] = struct{}{}
		}

		var rows []models.Job
		if allErr := cursor.All(ctx, &rows); allErr != nil {
			return allErr
		}
		for _, row := range rows {
			var held []int64
			switch kind {
			case esiLinkOrder:
				held = row.LinkedOrderIDs()
			case esiLinkJob:
				held = row.LinkedESIJobIDs()
			case esiLinkTransaction:
				held = row.LinkedTransactionIDs()
			}
			for _, id := range held {
				// A holder carries all its own ids; only the intersection counts.
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

	set := bson.M{"_meta.lastModified": now}
	if sessionID != "" {
		set["_meta.sessionID"] = sessionID
	}
	if wsClientID != "" {
		set["_meta.clientID"] = wsClientID
	}

	return eipmongo.Retry(ctx, "relink esi ids", func() error {
		_, err := coll.UpdateOne(ctx,
			bson.M{"_meta.accountID": accountID},
			bson.M{
				"$addToSet": addToSet,
				// Clients drop realtime events older than their cursor, so the
				// write must move the document's clock.
				"$set": set,
			})
		return err
	})
}
