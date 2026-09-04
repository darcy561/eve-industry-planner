package models

import (
	"cmp"
	"maps"
	"slices"
	"strings"
)

// groupNameLimit caps a derived group name. Counted in characters, so a name is
// never cut inside one.
const groupNameLimit = 75

// groupContribution is what a set of jobs adds to a group's derived fields.
type groupContribution struct {
	jobIDs       []string
	typeIDs      map[int]struct{}
	materialIDs  map[int]struct{}
	linkedJobs   map[int64]struct{}
	linkedOrders map[int64]struct{}
	linkedTrans  map[int64]struct{}
	outputCount  int
	outputNames  []string
}

func contributionOf(jobs []Job) groupContribution {
	c := groupContribution{
		jobIDs:       make([]string, 0, len(jobs)),
		typeIDs:      map[int]struct{}{},
		materialIDs:  map[int]struct{}{},
		linkedJobs:   map[int64]struct{}{},
		linkedOrders: map[int64]struct{}{},
		linkedTrans:  map[int64]struct{}{},
		outputNames:  make([]string, 0, len(jobs)),
	}

	for i := range jobs {
		job := &jobs[i]
		c.jobIDs = append(c.jobIDs, job.JobID)
		c.typeIDs[job.ItemID] = struct{}{}
		c.materialIDs[job.ItemID] = struct{}{}

		// A parentless job is an output rather than an intermediate.
		if len(job.ParentJobs) == 0 {
			c.outputCount++
			if name := strings.TrimSpace(job.Name); name != "" {
				c.outputNames = append(c.outputNames, name)
			}
		}

		for _, material := range job.Build.Materials {
			c.materialIDs[material.TypeID] = struct{}{}
		}
		for _, id := range job.LinkedESIJobIDs() {
			c.linkedJobs[id] = struct{}{}
		}
		for _, id := range job.LinkedOrderIDs() {
			c.linkedOrders[id] = struct{}{}
		}
		for _, id := range job.LinkedTransactionIDs() {
			c.linkedTrans[id] = struct{}{}
		}
	}
	return c
}

// RebuildFrom reconstructs the whole group from the jobs that belong to it,
// mirroring the SPA's Group.createGroup.
//
// GroupStatus and AreComplete reset: per-job workflow progress was never
// recorded, so it cannot be derived.
func (g Group) RebuildFrom(jobs []Job) Group {
	c := contributionOf(jobs)
	return Group{
		GroupID:         g.GroupID,
		ShowComplete:    true,
		GroupType:       1,
		GroupStatus:     0,
		AreComplete:     []string{},
		ArchivedJobIDs:  []string{},
		GroupName:       groupNameFromOutputs(c.outputNames),
		IncludedJobIDs:  c.jobIDs,
		OutputJobCount:  c.outputCount,
		IncludedTypeIDs: slices.Sorted(maps.Keys(c.typeIDs)),
		MaterialIDs:     slices.Sorted(maps.Keys(c.materialIDs)),
		LinkedJobIDs:    slices.Sorted(maps.Keys(c.linkedJobs)),
		LinkedOrderIDs:  slices.Sorted(maps.Keys(c.linkedOrders)),
		LinkedTransIDs:  slices.Sorted(maps.Keys(c.linkedTrans)),
	}
}

// AddJobs folds jobs into a group that already exists, mirroring the SPA's
// Group.addJobsToGroup. A job being added is a live member, so it also loses any
// archived mark.
//
// GroupName, GroupStatus, AreComplete and ShowComplete belong to the group rather
// than to its jobs, and are left as they are.
func (g Group) AddJobs(jobs []Job) Group {
	c := contributionOf(jobs)

	added := make(map[string]struct{}, len(c.jobIDs))
	for _, id := range c.jobIDs {
		added[id] = struct{}{}
	}

	g.IncludedJobIDs = appendMissingIDs(g.IncludedJobIDs, c.jobIDs)
	g.ArchivedJobIDs = withoutIDs(g.ArchivedJobIDs, added)
	g.IncludedTypeIDs = sortedUnion(g.IncludedTypeIDs, c.typeIDs)
	g.MaterialIDs = sortedUnion(g.MaterialIDs, c.materialIDs)
	g.LinkedJobIDs = sortedUnion(g.LinkedJobIDs, c.linkedJobs)
	g.LinkedOrderIDs = sortedUnion(g.LinkedOrderIDs, c.linkedOrders)
	g.LinkedTransIDs = sortedUnion(g.LinkedTransIDs, c.linkedTrans)
	g.OutputJobCount += c.outputCount
	return g
}

// groupNameFromOutputs names a group after the jobs it produces.
func groupNameFromOutputs(names []string) string {
	if len(names) == 0 {
		return "Untitled Group"
	}
	joined := strings.Join(names, ", ")
	runes := []rune(joined)
	if len(runes) > groupNameLimit {
		return string(runes[:groupNameLimit])
	}
	return joined
}

func appendMissingIDs(existing, add []string) []string {
	held := make(map[string]struct{}, len(existing))
	for _, id := range existing {
		held[id] = struct{}{}
	}
	out := slices.Clone(existing)
	if out == nil {
		out = []string{}
	}
	for _, id := range add {
		if _, dup := held[id]; dup {
			continue
		}
		held[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func withoutIDs(existing []string, drop map[string]struct{}) []string {
	out := make([]string, 0, len(existing))
	for _, id := range existing {
		if _, gone := drop[id]; gone {
			continue
		}
		out = append(out, id)
	}
	return out
}

// sortedUnion folds a contribution into ids a group already holds. Sorted, so an
// unchanged group is not rewritten as modified: map iteration order would
// otherwise reorder it on every write.
func sortedUnion[T cmp.Ordered](existing []T, add map[T]struct{}) []T {
	set := make(map[T]struct{}, len(existing)+len(add))
	for _, id := range existing {
		set[id] = struct{}{}
	}
	maps.Copy(set, add)
	return slices.Sorted(maps.Keys(set))
}
