package mongo

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"time"

	"eve-industry-planner/shared/documentschema"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// DefaultAccountPlannerName is what an account's own planner is called until the
// account renames it.
const DefaultAccountPlannerName = "My planner"

// PlannerWrite is what a planner is created with, beyond its owner.
//
// SeedSettingsFrom is empty for a planner that starts on the defaults: a shared
// one does not inherit the settings of whoever opened it first.
type PlannerWrite struct {
	Name             string
	CreatedBy        string
	Member           bool
	SeedSettingsFrom string
}

// EnsurePlanner writes a planner, its settings, and optionally the membership row
// putting CreatedBy in it. It returns the stored planner, which keeps the name it
// already had.
//
// Each document is written only if it is absent, and they are checked
// separately: one guard over all three would stop repairing a planner that has
// lost only its membership row or only its settings.
func (m *Mongo) EnsurePlanner(ctx context.Context, owner models.Owner, write PlannerWrite, now time.Time) (planner.Planner, error) {
	if m == nil || owner.IsZero() || write.CreatedBy == "" {
		return planner.Planner{}, fmt.Errorf("EnsurePlanner: invalid arguments")
	}
	plannerID := owner.Key()

	doc := planner.Planner{
		SchemaVersion: planner.SchemaCurrent,
		Name:          write.Name,
		MemberCount:   1,
		CreatedBy:     write.CreatedBy,
	}
	doc.MetaData.Owner = owner
	doc.MetaData.LastModified = now.UTC()
	if err := insertIfAbsent(ctx, m.Planners, plannerID, doc); err != nil {
		return planner.Planner{}, fmt.Errorf("write planner %s: %w", plannerID, err)
	}

	if write.Member {
		if err := m.ensureOwnerMembership(ctx, owner, write.CreatedBy, now); err != nil {
			return planner.Planner{}, err
		}
	}

	if err := m.EnsurePlannerSettings(ctx, owner, write.SeedSettingsFrom, now); err != nil {
		return planner.Planner{}, err
	}

	var stored planner.Planner
	if err := m.Planners.Collection().
		FindOne(ctx, bson.M{"_id": plannerID}).Decode(&stored); err != nil {
		return planner.Planner{}, fmt.Errorf("read planner %s: %w", plannerID, err)
	}
	return stored, nil
}

// EnsureAccountPlanner gives an account the planner it works in, and puts the
// account in it. Its `_id` is the account's owner key, so nothing is minted.
func (m *Mongo) EnsureAccountPlanner(ctx context.Context, accountID string, now time.Time) error {
	if m == nil || accountID == "" {
		return fmt.Errorf("EnsureAccountPlanner: invalid arguments")
	}
	owner := models.AccountOwner(accountID)
	if owner.IsZero() {
		return fmt.Errorf("account id %q yields no owner", accountID)
	}

	_, err := m.EnsurePlanner(ctx, owner, PlannerWrite{
		Name:             DefaultAccountPlannerName,
		CreatedBy:        accountID,
		Member:           true,
		SeedSettingsFrom: accountID,
	}, now)
	return err
}

// ensureOwnerMembership puts an account in the planner that is its own.
func (m *Mongo) ensureOwnerMembership(ctx context.Context, owner models.Owner, accountID string, now time.Time) error {
	plannerID := owner.Key()
	membership := planner.Membership{
		SchemaVersion: planner.MembershipSchemaCurrent,
		PlannerID:     plannerID,
		AccountID:     accountID,
		JoinedAt:      now.UTC(),
		JoinMethod:    planner.JoinMethod{Owner: &planner.OwnerAccount{}},
	}
	membership.MetaData.Owner = owner
	membership.MetaData.LastModified = now.UTC()
	if err := membership.JoinMethod.Validate(); err != nil {
		return fmt.Errorf("membership for %s: %w", accountID, err)
	}
	if err := insertIfAbsent(ctx, m.PlannerMemberships,
		planner.MembershipID(plannerID, accountID), membership); err != nil {
		return fmt.Errorf("write membership for %s: %w", accountID, err)
	}
	return nil
}

// insertIfAbsent writes doc under docID only when no document holds that id.
//
// The document is marshalled from its model rather than assembled as a map, so
// the stored shape cannot drift from the struct that reads it back. `_id` is
// dropped from the payload because the filter already carries it, and Mongo
// refuses an update that names the id twice.
func insertIfAbsent(ctx context.Context, docs *Docs, docID string, doc any) error {
	coll, err := docs.requireColl()
	if err != nil {
		return err
	}
	raw, err := bson.Marshal(doc)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	var fields bson.M
	if err := bson.Unmarshal(raw, &fields); err != nil {
		return fmt.Errorf("unmarshal: %w", err)
	}
	delete(fields, "_id")

	_, err = coll.UpdateOne(ctx,
		bson.M{"_id": docID},
		bson.M{"$setOnInsert": fields},
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

// EnsurePlannerSettings gives a planner the settings its work is done under.
//
// Insert-only, like the planner and membership writes above: a repeat call
// rewrites nothing, so settings the planner has since changed are kept. That is
// what lets first login, the release backfill and planner creation share one
// implementation.
//
// `seedFrom` is the account whose settings a new planner starts from, so it
// behaves as whoever created it expects. Pass an empty id to seed the defaults
// instead — a planner nobody's settings should follow.
func (m *Mongo) EnsurePlannerSettings(ctx context.Context, owner models.Owner, seedFrom string, now time.Time) error {
	if m == nil || owner.IsZero() {
		return fmt.Errorf("EnsurePlannerSettings: invalid arguments")
	}

	settings := planner.DefaultSettings(owner, now.UTC())
	if seedFrom != "" {
		account, err := m.LoadApplicationSettings(ctx, seedFrom, now)
		switch {
		case err == nil:
			settings = planner.SettingsFromAccount(owner, account, now.UTC())
		case errors.Is(err, mongo.ErrNoDocuments):
			// An account with no settings document has nothing to seed from, and
			// the defaults are what it would itself have been given. The release
			// backfill reaches accounts in that state, so this cannot be fatal.
		default:
			return fmt.Errorf("read settings to seed %s from %s: %w", owner.Key(), seedFrom, err)
		}
	}

	if err := insertIfAbsent(ctx, m.PlannerSettings, owner.Key(), settings); err != nil {
		return fmt.Errorf("write settings for %s: %w", owner.Key(), err)
	}
	return nil
}

// UpdatePlannerSettings changes part of the settings a planner's work is done
// under, and answers the settings as they now stand.
//
// Field-scoped rather than a document replacement: two members editing one
// planner each send what they changed, so neither carries the other's stale copy
// back over it.
//
// A planner with no settings document is reported as [mongo.ErrNoDocuments]
// rather than given one. The document is written when the planner is, so its
// absence means the planner does not exist.
func (m *Mongo) UpdatePlannerSettings(ctx context.Context, owner models.Owner, update planner.SettingsUpdate, meta models.MetaData, now time.Time) (planner.Settings, error) {
	fields := update.Fields()
	if m == nil || owner.IsZero() || len(fields) == 0 {
		return planner.Settings{}, fmt.Errorf("UpdatePlannerSettings: invalid arguments")
	}
	meta.Owner = owner
	meta.LastModified = now.UTC()
	raw, err := bson.Marshal(meta)
	if err != nil {
		return planner.Settings{}, fmt.Errorf("marshal settings meta: %w", err)
	}
	var metaFields bson.D
	if err := bson.Unmarshal(raw, &metaFields); err != nil {
		return planner.Settings{}, fmt.Errorf("decode settings meta: %w", err)
	}
	maps.Copy(fields, MetaSetByPath(metaFields))

	var stored planner.Settings
	err = Retry(ctx, "UpdatePlannerSettings", func() error {
		return m.PlannerSettings.Collection().FindOneAndUpdate(ctx,
			bson.M{"_id": owner.Key()},
			bson.M{"$set": fields, "$inc": bson.M{FieldMetaRevision: 1}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&stored)
	})
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return planner.Settings{}, err
		}
		return planner.Settings{}, fmt.Errorf("update settings for %s: %w", owner.Key(), err)
	}

	documentschema.Upgrader{}.PlannerSettings(&stored)
	return stored, nil
}
