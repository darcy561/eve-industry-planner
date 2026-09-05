// Package jobidentity holds the worker side of the entity-ref conversion sweep:
// replacing raw entity ids on stored job documents with refs, and bringing
// documents written under an older field set onto the current one.
package jobidentity

import (
	"context"
	"fmt"
	"strings"

	sharedjobidentity "eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/protectedfields"
	"eve-industry-planner/worker/taskrun"
)

// EncodeJobIdentity converts one account's job documents onto the current field
// set. Re-running is safe: conversion is idempotent and a document already on the
// current spec with no raw ids is not selected.
func EncodeJobIdentity(ctx context.Context, payload eipnats.EncodeJobIdentityRequest, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	payload.AccountID = strings.TrimSpace(payload.AccountID)
	payload.Collection = strings.TrimSpace(payload.Collection)
	if payload.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}
	if !sharedjobidentity.SupportedCollection(payload.Collection) {
		return fmt.Errorf("unsupported collection %q", payload.Collection)
	}

	refs := deps.EntityCipher
	if refs == nil {
		return fmt.Errorf("entity ref helper is required")
	}

	docs := deps.Mongo.Docs(payload.Collection)
	coll := docs.Collection()
	if coll == nil {
		return fmt.Errorf("collection handle is required for %s", payload.Collection)
	}

	cursor, err := coll.Find(ctx, sharedjobidentity.AccountWorkFilter(payload.AccountID))
	if err != nil {
		return fmt.Errorf("query %s for entity ref conversion: %w", payload.Collection, err)
	}
	defer cursor.Close(ctx)

	scanned, converted, skipped := 0, 0, 0
	items := make([]eipmongo.StructUpsertItem, 0, 64)

	for cursor.Next(ctx) {
		var doc models.Job
		if err := cursor.Decode(&doc); err != nil {
			logs.WarnCtx(ctx, "entity ref conversion: decode failed", "collection", payload.Collection, "error", err)
			continue
		}
		scanned++

		if err := sharedjobidentity.Encrypt(&doc, refs); err != nil {
			logs.WarnCtx(ctx, "entity ref conversion: failed, leaving document untouched",
				"collection", payload.Collection, "job_id", doc.JobID, "error", err)
			skipped++
			continue
		}
		// A raw id surviving conversion means the declaration and the stored shape
		// disagree; writing it back would persist the id we were removing.
		if sharedjobidentity.HasRawIDs(&doc) {
			logs.WarnCtx(ctx, "entity ref conversion: raw id survived, leaving document untouched",
				"collection", payload.Collection, "job_id", doc.JobID)
			skipped++
			continue
		}

		docID := strings.TrimSpace(doc.JobID)
		if docID == "" {
			skipped++
			continue
		}
		converted++
		if !payload.DryRun {
			items = append(items, eipmongo.StructUpsertItem{DocID: docID, Value: doc})
		}
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("iterate %s for entity ref conversion: %w", payload.Collection, err)
	}

	summary := eipmongo.BulkUpsertSummary{}
	if len(items) > 0 {
		summary, err = docs.UpsertStructsPreservingMetaBulk(ctx, items, len(items))
		if err != nil {
			return fmt.Errorf("entity ref conversion bulk upsert failed: %w", err)
		}
	}

	logs.InfoCtx(ctx, "entity ref conversion complete",
		"collection", payload.Collection,
		"account_id", payload.AccountID,
		"scanned", scanned,
		"converted", converted,
		"skipped", skipped,
		"written", summary.Success,
		"failed_writes", summary.Failed,
		"dry_run", payload.DryRun,
		"spec", string(protectedfields.SpecJobFieldsV1),
	)
	return nil
}
