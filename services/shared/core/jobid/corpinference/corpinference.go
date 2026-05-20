package corpinference

import "eve-industry-planner/shared/models"

const (
	StatusKnown     = "known"
	StatusNone      = "none"
	StatusAmbiguous = "ambiguous"
)

// InferJobCorp applies the single-distinct-corp rule:
// - one distinct corp from linked ESI jobs => known
// - none => none
// - more than one => ambiguous
//
// Historic documents often omit is_corporation while corporation_id is still set on corp facility
// jobs; any linked job with corporation_id > 0 participates in the distinct set (same as counting
// corp-flagged rows when the flag is present).
func InferJobCorp(linkedJobs []models.LinkedESIJob) (int, string) {
	distinct := map[int]struct{}{}
	for _, linked := range linkedJobs {
		if linked.CorporationID <= 0 {
			continue
		}
		distinct[linked.CorporationID] = struct{}{}
	}
	switch len(distinct) {
	case 0:
		return 0, StatusNone
	case 1:
		for corpID := range distinct {
			return corpID, StatusKnown
		}
	}
	return 0, StatusAmbiguous
}

// InferSingleDistinctCorpIDFromLinkedJobMap returns the corp ID when m maps linked job IDs to corp IDs
// and exactly one distinct positive corp appears (matches corp aggregation fallback rules).
func InferSingleDistinctCorpIDFromLinkedJobMap(m map[int]int) (int, bool) {
	if len(m) == 0 {
		return 0, false
	}
	distinct := map[int]struct{}{}
	for _, corp := range m {
		if corp <= 0 {
			continue
		}
		distinct[corp] = struct{}{}
	}
	if len(distinct) != 1 {
		return 0, false
	}
	for id := range distinct {
		return id, true
	}
	return 0, false
}
