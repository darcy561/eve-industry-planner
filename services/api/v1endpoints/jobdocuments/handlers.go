package jobdocuments

import (
	"fmt"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
)

type Handlers struct {
	*apideps.Deps
	locks documentlock.Deps
}

// encryptJobs converts a batch to its stored form in place, before a write.
func (h *Handlers) encryptJobs(jobs []models.Job) error {
	if h.EntityCipher == nil {
		return fmt.Errorf("entity id cipher is not configured")
	}
	for i := range jobs {
		if err := jobidentity.Encrypt(&jobs[i], h.EntityCipher); err != nil {
			return err
		}
	}
	return nil
}

// decryptJob restores the entity ids a client is owed, before a response.
func (h *Handlers) decryptJob(job *models.Job) error {
	if h.EntityCipher == nil {
		return fmt.Errorf("entity id cipher is not configured")
	}
	return jobidentity.Decrypt(job, h.EntityCipher)
}

// decryptJobs restores entity ids across a batch in place.
func (h *Handlers) decryptJobs(jobs []models.Job) error {
	for i := range jobs {
		if err := h.decryptJob(&jobs[i]); err != nil {
			return err
		}
	}
	return nil
}

func New(deps *apideps.Deps) *Handlers {
	if deps == nil {
		deps = &apideps.Deps{}
	}
	return &Handlers{Deps: deps, locks: deps.LockDeps()}
}
