// Package archivestats turns an archived job into the figures the statistics
// pipelines read. Everything here is a pure transformation: no Mongo, no clock,
// no key material, so the rules are testable in isolation from the worker that
// applies them.
package archivestats

import (
	"slices"

	"eve-industry-planner/shared/models"
)

// CorpInference is what a job's linked industry jobs say about which corporation
// owns it.
type CorpInference string

const (
	// CorpInferenceKnown means exactly one corporation appears across the linked jobs.
	CorpInferenceKnown CorpInference = "known"
	// CorpInferenceNone means no linked job names a corporation.
	CorpInferenceNone CorpInference = "none"
	// CorpInferenceAmbiguous means more than one does, so no single owner follows.
	CorpInferenceAmbiguous CorpInference = "ambiguous"
)

// InferJobCorp applies the single-distinct-corporation rule to a job's linked
// industry jobs, returning the ref when exactly one corporation appears.
//
// A sale line often carries no corporation of its own while the facility jobs
// behind it do, which is what makes this worth inferring. More than one
// corporation is left unresolved rather than guessed: attributing a line to the
// wrong corporation is worse than attributing it to none, because a corporation
// aggregate would then count revenue it never earned.
//
// Older documents omit is_corporation while still carrying the corporation, so
// membership of the distinct set is decided by the ref alone.
func InferJobCorp(linkedJobs []models.LinkedESIJob) (corpRef string, inference CorpInference) {
	distinct := DistinctLinkedIndustryCorpRefs(linkedJobs)
	switch len(distinct) {
	case 0:
		return "", CorpInferenceNone
	case 1:
		return distinct[0], CorpInferenceKnown
	default:
		return "", CorpInferenceAmbiguous
	}
}

// DistinctLinkedIndustryCorpRefs returns the sorted unique corporation refs across
// a job's linked industry jobs. Sorted so a rebuild produces the same document as
// the run before it, which is what makes rebuilds idempotent.
func DistinctLinkedIndustryCorpRefs(linkedJobs []models.LinkedESIJob) []string {
	if len(linkedJobs) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(linkedJobs))
	for _, linked := range linkedJobs {
		if linked.CorporationRef != "" {
			seen[linked.CorporationRef] = struct{}{}
		}
	}
	if len(seen) == 0 {
		return nil
	}
	out := make([]string, 0, len(seen))
	for ref := range seen {
		out = append(out, ref)
	}
	slices.Sort(out)
	return out
}
