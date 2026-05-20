package linkedjobcorp

import (
	corecrypto "eve-industry-planner/shared/core/crypto/aesgcm"
	"eve-industry-planner/shared/core/sealedfields"
	"eve-industry-planner/shared/core/sealedfields/entityids"
	"eve-industry-planner/shared/models"
)

// Resolve returns linked-job corporation IDs keyed by LinkedESIJob.JobID.
// Priority: Sealed payload value first, then legacy plaintext bson field.
func Resolve(job *models.Job, keyring *corecrypto.Keyring) map[int]int {
	out := map[int]int{}
	if job == nil {
		return out
	}

	// Legacy plaintext fallback (historic docs).
	for _, linked := range job.Build.Costs.LinkedJobs {
		if linked.JobID > 0 && linked.CorporationID > 0 {
			out[linked.JobID] = linked.CorporationID
		}
	}

	// Sealed value overrides legacy where present.
	if job.Sealed != nil && keyring != nil {
		plaintext, err := sealedfields.Open(keyring, job.Sealed)
		if err == nil {
			if sealedMap, parseErr := entityids.LinkedJobCorporationsFromPlaintext(plaintext); parseErr == nil {
				for jobID, corpID := range sealedMap {
					out[jobID] = corpID
				}
			}
		}
	}

	return out
}
