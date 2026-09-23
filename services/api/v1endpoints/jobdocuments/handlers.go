package jobdocuments

import (
	"fmt"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
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

// dropHeldJobs removes the jobs another session holds a lock on, keeping the
// rest in the order they arrived.
//
// Filters in place, so the caller's slice is consumed: the jobs it names are
// already decoded and nothing reads the original afterwards.
func dropHeldJobs(jobs []models.Job, held []documentlock.LockHeldElsewhereItem) []models.Job {
	blocked := make(map[string]struct{}, len(held))
	for _, item := range held {
		blocked[item.DocID] = struct{}{}
	}
	writable := jobs[:0]
	for _, job := range jobs {
		if _, isHeld := blocked[job.JobID]; !isHeld {
			writable = append(writable, job)
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

// writtenJobIDs names the documents the batch actually wrote.
//
// A batch answers with one refusal, so a client cannot work this out by taking
// the documents it was told about away from the ones it sent: a batch holding
// one document and refusing another on its revision says only that something was
// held, and the refused one would be counted as written.
func writtenJobIDs(sent []models.Job, failed []string, conflicts []eipmongo.RevisionConflict) []string {
	missed := make(map[string]struct{}, len(failed)+len(conflicts))
	for _, jobID := range failed {
		missed[jobID] = struct{}{}
	}
	for _, conflict := range conflicts {
		missed[conflict.JobID] = struct{}{}
	}

	written := make([]string, 0, len(sent))
	for _, job := range sent {
		if job.JobID == "" {
			continue
		}
		if _, refused := missed[job.JobID]; refused {
			continue
		}
		written = append(written, job.JobID)
	}
	return written
}
