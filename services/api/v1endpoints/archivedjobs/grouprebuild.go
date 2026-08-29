package archivedjobs

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// groupNameLimit matches the SPA's cap when naming a group from its outputs.
const groupNameLimit = 75

// rebuildGroup reconstructs a group from its jobs, mirroring the SPA's
// Group.createGroup. GroupStatus and AreComplete reset: per-job workflow
// progress was never recorded, so it cannot be derived.
func rebuildGroup(groupID string, jobs []models.Job) models.Group {
	group := models.Group{
		GroupID:      groupID,
		ShowComplete: true,
		GroupType:    1,
		GroupStatus:  0,
		AreComplete:  []string{},
	}

	includedJobIDs := make([]string, 0, len(jobs))
	typeIDs := map[int]struct{}{}
	materialIDs := map[int]struct{}{}
	linkedJobs := map[int64]struct{}{}
	linkedOrders := map[int64]struct{}{}
	linkedTrans := map[int64]struct{}{}
	outputNames := make([]string, 0, len(jobs))

	for i := range jobs {
		job := &jobs[i]
		includedJobIDs = append(includedJobIDs, job.JobID)
		typeIDs[job.ItemID] = struct{}{}
		materialIDs[job.ItemID] = struct{}{}

		// A parentless job is an output rather than an intermediate.
		if len(job.ParentJobs) == 0 {
			group.OutputJobCount++
			if name := strings.TrimSpace(job.Name); name != "" {
				outputNames = append(outputNames, name)
			}
		}

		for _, material := range job.Build.Materials {
			materialIDs[material.TypeID] = struct{}{}
		}
		for _, id := range job.APIJobs {
			linkedJobs[int64(id)] = struct{}{}
		}
		for _, id := range job.APIOrders {
			linkedOrders[int64(id)] = struct{}{}
		}
		for _, id := range job.APITransactions {
			linkedTrans[int64(id)] = struct{}{}
		}
	}

	group.GroupName = groupNameFromOutputs(outputNames)
	group.IncludedJobIDs = includedJobIDs
	group.IncludedTypeIDs = sortedInts(typeIDs)
	group.MaterialIDs = sortedInts(materialIDs)
	group.LinkedJobIDs = sortedInt64s(linkedJobs)
	group.LinkedOrderIDs = sortedInt64s(linkedOrders)
	group.LinkedTransIDs = sortedInt64s(linkedTrans)
	return group
}

// groupNameFromOutputs names a group after the jobs it produces.
func groupNameFromOutputs(names []string) string {
	if len(names) == 0 {
		return "Untitled Group"
	}
	joined := strings.Join(names, ", ")
	if len(joined) > groupNameLimit {
		return joined[:groupNameLimit]
	}
	return joined
}

// sortedInts renders a set stably, so an unchanged group is not rewritten as
// modified on every restore.
func sortedInts(set map[int]struct{}) []int {
	out := make([]int, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	slices.Sort(out)
	return out
}

func sortedInt64s(set map[int64]struct{}) []int64 {
	out := make([]int64, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	slices.Sort(out)
	return out
}

func writeGroup(ctx context.Context, m *eipmongo.Mongo, accountID string, group models.Group, now time.Time, sessionID, wsClientID string) error {
	if m == nil || m.Groups == nil {
		return fmt.Errorf("mongo handle is required")
	}
	_, err := m.Groups.BulkUpsertGroups(ctx, accountID, []models.Group{group}, now, sessionID, wsClientID)
	return err
}
