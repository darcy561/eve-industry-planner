// Package jobidentity declares which fields on a job document hold EVE entity
// ids, and converts them between the refs it stores and the raw ids a client
// sees, so no raw id is persisted.
//
// The declaration is the point: encryption, decryption, clearing and detection
// all traverse the same table, so they cannot disagree about which fields carry
// identity.
package jobidentity

import (
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/protectedfields"
)

// Declaration is the job document's protected field set.
var Declaration = protectedfields.Declaration[models.Job]{
	Spec:    protectedfields.SpecJobFieldsV1,
	Targets: targets,
}

// targets lists every entity id a job carries. Adding an identity-bearing line
// type means adding it here and nowhere else.
func targets(job *models.Job) []protectedfields.Target {
	if job == nil {
		return nil
	}
	out := make([]protectedfields.Target, 0, 16)

	// A row held in a map is not addressable, so each one is copied, pointed at,
	// and filed back under its key by Store. The copy is per iteration, which is
	// what keeps the three targets taken from one row pointing at that row rather
	// than at whichever the loop reached last.
	for id, tx := range job.ESI.Transactions {
		out = append(out,
			protectedfields.Target{Kind: protectedfields.KindCorp, ID: &tx.CorporationID, Ref: &tx.CorporationRef,
				Store: func() { job.ESI.Transactions[id] = tx }},
			protectedfields.Target{Kind: protectedfields.KindCharacter, ID: &tx.CharacterID, Ref: &tx.CharacterRef,
				Store: func() { job.ESI.Transactions[id] = tx }},
		)
	}

	for id, order := range job.ESI.MarketOrders {
		out = append(out,
			protectedfields.Target{Kind: protectedfields.KindCorp, ID: &order.CorporationID, Ref: &order.CorporationRef,
				Store: func() { job.ESI.MarketOrders[id] = order }},
			protectedfields.Target{Kind: protectedfields.KindCharacter, ID: &order.CharacterID, Ref: &order.CharacterRef,
				Store: func() { job.ESI.MarketOrders[id] = order }},
		)
	}

	for id, linked := range job.ESI.LinkedJobs {
		out = append(out,
			protectedfields.Target{Kind: protectedfields.KindCorp, ID: &linked.CorporationID, Ref: &linked.CorporationRef,
				Store: func() { job.ESI.LinkedJobs[id] = linked }},
			protectedfields.Target{Kind: protectedfields.KindCharacter, ID: &linked.CharacterID, Ref: &linked.CharacterRef,
				Store: func() { job.ESI.LinkedJobs[id] = linked }},
		)
	}

	return out
}

// Encrypt converts every entity id on job into its ref, clears the id,
// and marks the document with the field set that was applied. Safe to re-run.
func Encrypt(job *models.Job, c *entityid.Cipher) error {
	if job == nil {
		return nil
	}
	if err := protectedfields.Encrypt(Declaration, job, c); err != nil {
		return err
	}
	if job.Protected == nil {
		job.Protected = &models.FieldProtection{}
	}
	job.Protected.Spec = string(Declaration.Spec)
	return nil
}

// Decrypt restores the raw entity ids a client is owed, for the response
// boundary. The stored values are left in place and are suppressed on the wire
// by the model's json tags.
func Decrypt(job *models.Job, c *entityid.Cipher) error {
	return protectedfields.Decrypt(Declaration, job, c)
}

// HasRawIDs reports whether job still holds an entity id, which is the selection
// condition for the conversion backfill.
func HasRawIDs(job *models.Job) bool { return protectedfields.HasRawIDs(Declaration, job) }
