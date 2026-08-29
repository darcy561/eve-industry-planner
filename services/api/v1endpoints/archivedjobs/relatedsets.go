package archivedjobs

import "slices"

// relatedSetIDs groups jobs sharing a dependency graph, keyed by the lowest job
// id in each set. Jobs linking to nothing are absent from the result.
func relatedSetIDs(jobs []ArchivedJobSummary) map[string]string {
	parent := make(map[string]string, len(jobs))

	var find func(string) string
	find = func(id string) string {
		root, seen := parent[id]
		if !seen {
			parent[id] = id
			return id
		}
		if root == id {
			return id
		}
		root = find(root)
		parent[id] = root
		return root
	}
	union := func(a, b string) {
		rootA, rootB := find(a), find(b)
		if rootA == rootB {
			return
		}
		// Lower id becomes the root, so it is the id reported for the set.
		if rootB < rootA {
			rootA, rootB = rootB, rootA
		}
		parent[rootB] = rootA
	}

	present := make(map[string]struct{}, len(jobs))
	for _, job := range jobs {
		present[job.JobID] = struct{}{}
	}

	linked := make(map[string]struct{}, len(jobs))
	for _, job := range jobs {
		find(job.JobID)
		for _, relatedID := range job.RelatedJobIDs() {
			if relatedID == "" || relatedID == job.JobID {
				continue
			}
			// Off-page links mark the job as linked but cannot join two rows.
			if _, ok := present[relatedID]; !ok {
				linked[job.JobID] = struct{}{}
				continue
			}
			linked[job.JobID] = struct{}{}
			linked[relatedID] = struct{}{}
			union(job.JobID, relatedID)
		}
	}

	out := make(map[string]string, len(linked))
	for jobID := range linked {
		out[jobID] = find(jobID)
	}
	return out
}

// relatedJobIDsInArchive returns every archived job reachable from startID.
// Links to jobs the archive does not hold are skipped; the caller reports them.
func relatedJobIDsInArchive(jobs []ArchivedJobSummary, startID string) []string {
	byID := make(map[string]ArchivedJobSummary, len(jobs))
	for _, job := range jobs {
		byID[job.JobID] = job
	}

	seen := make(map[string]struct{}, len(jobs))
	stack := []string{startID}
	for len(stack) > 0 {
		id := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if _, done := seen[id]; done {
			continue
		}
		job, ok := byID[id]
		if !ok {
			continue
		}
		seen[id] = struct{}{}
		stack = append(stack, job.RelatedJobIDs()...)
	}

	out := make([]string, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	slices.Sort(out)
	return out
}
