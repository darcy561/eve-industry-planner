package commands

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"slices"
	"strings"
	"time"

	"eve-industry-planner/shared/lifecycle"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// currentRelease is the version whose cutover work the commands below back up
// and revert. The release list and the backup suffix are both derived from it.
const currentRelease = "0.9.0"

// releaseBackupsCollection records which collections a release copied and how
// many documents each held, so a revert knows what to put back — including that
// a collection was empty, which has no copy to show for it.
const releaseBackupsCollection = "release_backups"

// backupSuffix names a copy of a collection as it stood before the release.
// Derived from the live name rather than written out, so a collection rename
// carries its copy with it.
func backupSuffix(release string) string {
	return "_pre_" + strings.ReplaceAll(release, ".", "_")
}

// releaseTouchedCollections is every collection a step of this release or its
// fan-out commands writes to, in the order they are copied.
//
// Built from the lists the steps themselves iterate rather than written out
// again, so a collection a step starts writing to is backed up by the same edit
// that made it a target.
func releaseTouchedCollections() []string {
	var out []string
	for _, group := range [][]string{
		metaOwnerCollections,
		eipmongo.OwnerScopedIDCollections(),
		derivedStatisticsCollections,
		accountPlannerCollections,
		reshapeJobCollections,
	} {
		for _, name := range group {
			if !slices.Contains(out, name) {
				out = append(out, name)
			}
		}
	}
	return out
}

// backupRecord is one manifest row: a collection copied for a release.
type backupRecord struct {
	ID         string    `bson:"_id"`
	Release    string    `bson:"release"`
	Collection string    `bson:"collection"`
	Documents  int64     `bson:"documents"`
	TakenAt    time.Time `bson:"takenAt"`
}

func backupRecordID(release, collection string) string {
	return release + "|" + collection
}

// backupReleaseCollections is the release's first step: every collection the
// release writes to is copied before anything writes.
func backupReleaseCollections(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	return backupCollections(ctx, clients.Mongo, currentRelease, releaseTouchedCollections(), dryRun)
}

// backupCollections copies each collection server-side and records the copy.
//
// A collection already recorded for this release is left alone, whatever it now
// holds: the copy is the pre-release state, and a re-run after the steps have
// written must not replace it with a half-migrated one.
func backupCollections(ctx context.Context, m *eipmongo.Mongo, release string, names []string, dryRun bool) (string, error) {
	if m == nil {
		return "", errors.New("mongo handle is required")
	}
	manifest := m.Coll(releaseBackupsCollection)
	reports := make([]string, 0, len(names))

	for _, name := range names {
		var recorded backupRecord
		err := manifest.FindOne(ctx, bson.M{"_id": backupRecordID(release, name)}).Decode(&recorded)
		switch {
		case err == nil:
			reports = append(reports, fmt.Sprintf("%s already copied (%d)", name, recorded.Documents))
			continue
		case !errors.Is(err, mongodriver.ErrNoDocuments):
			return "", fmt.Errorf("read the backup record for %s: %w", name, err)
		}

		copied, report, err := snapshotCollection(ctx, m, name, name+backupSuffix(release), dryRun)
		if err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		reports = append(reports, report)
		if dryRun {
			continue
		}
		if _, err := manifest.InsertOne(ctx, backupRecord{
			ID: backupRecordID(release, name), Release: release, Collection: name,
			Documents: copied, TakenAt: time.Now().UTC(),
		}); err != nil {
			return "", fmt.Errorf("record the copy of %s: %w", name, err)
		}
	}
	return strings.Join(reports, "; "), nil
}

// snapshotCollection copies one collection to target and reports how many
// documents it holds. An empty collection makes no copy: there is nothing to
// copy, and the record of zero is what a revert reads.
func snapshotCollection(ctx context.Context, m *eipmongo.Mongo, name, target string, dryRun bool) (int64, string, error) {
	source := m.Coll(name)

	held, err := source.CountDocuments(ctx, bson.M{})
	if err != nil {
		return 0, "", fmt.Errorf("count: %w", err)
	}
	if held == 0 {
		return 0, fmt.Sprintf("%s is empty", name), nil
	}
	if dryRun {
		return held, fmt.Sprintf("%s: %d would copy to %s", name, held, target), nil
	}

	// $out copies server-side, so no document travels through this process.
	cursor, err := source.Aggregate(ctx, mongodriver.Pipeline{bson.D{{Key: "$out", Value: target}}})
	if err != nil {
		return 0, "", fmt.Errorf("copy to %s: %w", target, err)
	}
	if err := cursor.Close(ctx); err != nil {
		return 0, "", fmt.Errorf("copy to %s: %w", target, err)
	}

	// A short copy is reported rather than passed over: it is the one outcome that
	// would leave an operator believing there is a complete copy to fall back on.
	copied, err := m.Coll(target).CountDocuments(ctx, bson.M{})
	if err != nil {
		return 0, "", fmt.Errorf("count %s: %w", target, err)
	}
	if copied != held {
		return 0, "", fmt.Errorf("%s holds %d of %d documents", target, copied, held)
	}
	return copied, fmt.Sprintf("%s: %d copied to %s", name, copied, target), nil
}

// revertCollections puts every collection the release recorded back as it was
// copied. The copies are kept; dropping them is a separate command.
//
// Refused outright when nothing was recorded: reverting to copies that were
// never taken would drop what is there and restore nothing.
func revertCollections(ctx context.Context, m *eipmongo.Mongo, release string, dryRun bool) (string, error) {
	if m == nil {
		return "", errors.New("mongo handle is required")
	}
	records, err := backupRecords(ctx, m, release)
	if err != nil {
		return "", err
	}
	if len(records) == 0 {
		return "", fmt.Errorf("release %s recorded no backups; nothing to revert to", release)
	}

	reports := make([]string, 0, len(records))
	for _, record := range records {
		live := m.Coll(record.Collection)
		backup := m.Coll(record.Collection + backupSuffix(release))

		if record.Documents == 0 {
			if dryRun {
				reports = append(reports, fmt.Sprintf("%s would be emptied", record.Collection))
				continue
			}
			if err := live.Drop(ctx); err != nil {
				return "", fmt.Errorf("empty %s: %w", record.Collection, err)
			}
			reports = append(reports, fmt.Sprintf("%s emptied", record.Collection))
			continue
		}

		held, err := backup.CountDocuments(ctx, bson.M{})
		if err != nil {
			return "", fmt.Errorf("count the copy of %s: %w", record.Collection, err)
		}
		if held != record.Documents {
			return "", fmt.Errorf("the copy of %s holds %d documents, %d were recorded; refusing to revert from it",
				record.Collection, held, record.Documents)
		}
		if dryRun {
			reports = append(reports, fmt.Sprintf("%s: %d would be restored", record.Collection, held))
			continue
		}

		// $out into the live name replaces it atomically and keeps its indexes.
		cursor, err := backup.Aggregate(ctx, mongodriver.Pipeline{bson.D{{Key: "$out", Value: record.Collection}}})
		if err != nil {
			return "", fmt.Errorf("restore %s: %w", record.Collection, err)
		}
		if err := cursor.Close(ctx); err != nil {
			return "", fmt.Errorf("restore %s: %w", record.Collection, err)
		}
		restored, err := live.CountDocuments(ctx, bson.M{})
		if err != nil {
			return "", fmt.Errorf("count %s after restore: %w", record.Collection, err)
		}
		if restored != record.Documents {
			return "", fmt.Errorf("%s holds %d documents after restore, want %d", record.Collection, restored, record.Documents)
		}
		reports = append(reports, fmt.Sprintf("%s: %d restored", record.Collection, restored))
	}
	return strings.Join(reports, "; "), nil
}

// dropBackups removes a release's copies and the records of them.
func dropBackups(ctx context.Context, m *eipmongo.Mongo, release string, dryRun bool) (string, error) {
	if m == nil {
		return "", errors.New("mongo handle is required")
	}
	records, err := backupRecords(ctx, m, release)
	if err != nil {
		return "", err
	}
	if len(records) == 0 {
		return fmt.Sprintf("release %s has no backups", release), nil
	}
	if dryRun {
		return fmt.Sprintf("%d backup(s) of release %s would be dropped", len(records), release), nil
	}
	for _, record := range records {
		if record.Documents > 0 {
			if err := m.Coll(record.Collection + backupSuffix(release)).Drop(ctx); err != nil {
				return "", fmt.Errorf("drop the copy of %s: %w", record.Collection, err)
			}
		}
	}
	if _, err := m.Coll(releaseBackupsCollection).DeleteMany(ctx, bson.M{"release": release}); err != nil {
		return "", fmt.Errorf("forget the backups of %s: %w", release, err)
	}
	return fmt.Sprintf("%d backup(s) of release %s dropped", len(records), release), nil
}

func backupRecords(ctx context.Context, m *eipmongo.Mongo, release string) ([]backupRecord, error) {
	cursor, err := m.Coll(releaseBackupsCollection).Find(ctx, bson.M{"release": release})
	if err != nil {
		return nil, fmt.Errorf("read the backups of %s: %w", release, err)
	}
	defer cursor.Close(ctx)
	var records []backupRecord
	if err := cursor.All(ctx, &records); err != nil {
		return nil, fmt.Errorf("read the backups of %s: %w", release, err)
	}
	return records, nil
}

// runRevertRelease puts every collection the current release copied back as it
// was before the release ran. The copies are kept.
func runRevertRelease(ctx context.Context, args []string) error {
	dryRun, err := parseDryRun("revertRelease", args)
	if err != nil {
		return err
	}
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{Mongo: true})
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	report, err := revertCollections(ctx, clients.Mongo, currentRelease, dryRun)
	if err != nil {
		return fmt.Errorf("revertRelease: %w", err)
	}
	fmt.Println(report)
	return nil
}

// runDropReleaseBackups removes the current release's copies once the figures
// have been checked.
func runDropReleaseBackups(ctx context.Context, args []string) error {
	dryRun, err := parseDryRun("dropReleaseBackups", args)
	if err != nil {
		return err
	}
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{Mongo: true})
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	report, err := dropBackups(ctx, clients.Mongo, currentRelease, dryRun)
	if err != nil {
		return fmt.Errorf("dropReleaseBackups: %w", err)
	}
	fmt.Println(report)
	return nil
}

func parseDryRun(command string, args []string) (bool, error) {
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	dryRun := fs.Bool("dry-run", false, "report without writing")
	if err := fs.Parse(args); err != nil {
		return false, err
	}
	return *dryRun, nil
}
