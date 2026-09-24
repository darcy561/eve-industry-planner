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

// dropHeldWrites removes the writes another session holds a lock on, keeping
// the rest: one member editing one job no longer costs every other job in the
// same save.
func dropHeldWrites(writes []models.JobWriteBody, held []documentlock.LockHeldElsewhereItem) []models.JobWriteBody {
	blocked := make(map[string]struct{}, len(held))
	for _, item := range held {
		blocked[item.DocID] = struct{}{}
	}
	writable := writes[:0]
	for _, write := range writes {
		if _, isHeld := blocked[write.JobID]; !isHeld {
			writable = append(writable, write)
		}
	}
	return writable
}

// writeRefusal names which refusal a batch's response carries when more than one
// kind occurred.
//
// A response carries one, and the lock wins. A held job was never written and
// its edits are still owed; a revision conflict's document has moved on and the
// client reloads it either way. Answering the conflict first would leave the
// held jobs unnamed, and a client that clears what a refusal did not name would
// discard work nothing wrote.
type writeRefusal int

const (
	refusalNone writeRefusal = iota
	refusalLockHeld
	refusalRevision
)

func refusalFor(heldCount, conflictCount int) writeRefusal {
	switch {
	case heldCount > 0:
		return refusalLockHeld
	case conflictCount > 0:
		return refusalRevision
	default:
		return refusalNone
	}
}
