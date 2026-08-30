package archivedjobs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// groupJobsByGroupID splits restored jobs by the group each belongs to: a related
// set can reach jobs archived from different groups.
func groupJobsByGroupID(jobs []models.Job) ([]string, map[string][]models.Job) {
	byGroup := map[string][]models.Job{}
	order := make([]string, 0)
	for i := range jobs {
		groupID := jobs[i].GroupID
		if groupID == "" {
			continue
		}
		if _, seen := byGroup[groupID]; !seen {
			order = append(order, groupID)
		}
		byGroup[groupID] = append(byGroup[groupID], jobs[i])
	}
	return order, byGroup
}

// liveGroupMembers reads every job document on the account that names the group.
// The restored jobs are written before this runs, so one lookup returns them and
// any member that was never archived.
func liveGroupMembers(ctx context.Context, m *eipmongo.Mongo, accountID, groupID string) ([]models.Job, error) {
	if m == nil || m.JobDocuments == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	return m.JobDocuments.LoadJobsByFilter(ctx, accountID, bson.M{"groupID": groupID})
}

// restoreGroups returns each restored job to the group it was archived from:
// merged into the live group, or rebuilt from every job that names it when the
// group is gone.
func restoreGroups(ctx context.Context, m *eipmongo.Mongo, accountID string, jobs []models.Job, now time.Time, sessionID, wsClientID string) ([]models.Group, error) {
	order, byGroup := groupJobsByGroupID(jobs)
	if len(order) == 0 {
		return nil, nil
	}
	if m == nil || m.Groups == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}

	out := make([]models.Group, 0, len(order))
	for _, groupID := range order {
		existing, err := m.Groups.LoadGroupByID(ctx, accountID, groupID)
		switch {
		case err == nil:
			out = append(out, existing.AddJobs(byGroup[groupID]))
		case errors.Is(err, mongodriver.ErrNoDocuments):
			members, mErr := liveGroupMembers(ctx, m, accountID, groupID)
			if mErr != nil {
				return nil, fmt.Errorf("load members of group %s: %w", groupID, mErr)
			}
			if len(members) == 0 {
				members = byGroup[groupID]
			}
			out = append(out, models.Group{GroupID: groupID}.RebuildFrom(members))
		default:
			return nil, fmt.Errorf("load group %s: %w", groupID, err)
		}
	}

	if _, err := m.Groups.BulkUpsertGroups(ctx, accountID, out, now, sessionID, wsClientID); err != nil {
		return nil, err
	}
	return out, nil
}
