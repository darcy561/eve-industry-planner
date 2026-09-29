package commands

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// extrasInventionRowFields are the keyed collections under build whose rows carry an app-minted id.
var extrasInventionRowFields = []string{"extrasCosts", "inventionEntries"}

// extrasInventionRowReport counts what normalising one document's rows did.
type extrasInventionRowReport struct {
	Normalised int
	Refusals   []string
}

// normaliseExtrasAndInventionRows rewrites each extras and invention row holding a wrongly typed
// value in the shape its model writes, leaving correctly typed rows untouched.
func normaliseExtrasAndInventionRows(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.Mongo == nil {
		return "", fmt.Errorf("mongo handle is required")
	}
	return normaliseExtrasAndInventionRowsAcross(ctx, clients.Mongo, reshapeJobCollections, dryRun)
}

// normaliseExtrasAndInventionRowsAcross normalises every named collection before answering, so a
// refused row in one does not leave the rows of the others unwritten.
func normaliseExtrasAndInventionRowsAcross(ctx context.Context, m *eipmongo.Mongo, collections []string, dryRun bool) (string, error) {
	reports := make([]string, 0, len(collections))
	var refusals []string
	for _, name := range collections {
		report, refused, err := normaliseExtrasAndInventionRowsIn(ctx, m, name, dryRun)
		if err != nil {
			return "", err
		}
		reports = append(reports, report)
		refusals = append(refusals, refused...)
	}
	summary := strings.Join(reports, "; ")
	if len(refusals) > 0 {
		return "", fmt.Errorf("%s; %d row(s) refused: %s", summary, len(refusals), strings.Join(refusals, "; "))
	}
	return summary, nil
}

func normaliseExtrasAndInventionRowsIn(ctx context.Context, m *eipmongo.Mongo, collection string, dryRun bool) (string, []string, error) {
	coll := m.Coll(collection)
	if coll == nil {
		return "", nil, fmt.Errorf("%s collection unavailable", collection)
	}

	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		return "", nil, fmt.Errorf("read %s for row normalising: %w", collection, err)
	}
	defer cursor.Close(ctx)

	var documents, rows int
	var refusals []string
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return "", nil, fmt.Errorf("decode a %s document: %w", collection, err)
		}

		set, report := normaliseExtrasAndInventionRowsInDocument(doc)
		for _, refusal := range report.Refusals {
			refusals = append(refusals, fmt.Sprintf("%s %v: %s", collection, doc["_id"], refusal))
		}
		if len(set) == 0 {
			continue
		}
		documents++
		rows += report.Normalised

		if dryRun {
			continue
		}
		if _, err := coll.UpdateByID(ctx, doc["_id"], bson.M{"$set": set}); err != nil {
			return "", nil, fmt.Errorf("write %s %v: %w", collection, doc["_id"], err)
		}
	}
	if err := cursor.Err(); err != nil {
		return "", nil, fmt.Errorf("iterate %s for row normalising: %w", collection, err)
	}

	if documents == 0 {
		return fmt.Sprintf("%s: no row is wrongly typed", collection), refusals, nil
	}
	verb := "normalised"
	if dryRun {
		verb = "would be normalised"
	}
	return fmt.Sprintf("%s: %d row(s) across %d document(s) %s", collection, rows, documents, verb), refusals, nil
}

// normaliseExtrasAndInventionRowsInDocument answers the $set that normalises a document's wrongly
// typed rows, keyed by each row's stored path, and refuses a row whose id disagrees with its key.
func normaliseExtrasAndInventionRowsInDocument(doc bson.M) (bson.M, extrasInventionRowReport) {
	set := bson.M{}
	var report extrasInventionRowReport

	build := asDocument(doc["build"])
	for _, field := range extrasInventionRowFields {
		for key, raw := range asDocument(build[field]) {
			stored := asDocument(raw)
			normalised, err := normalisedRow(field, stored)
			if err != nil {
				report.Refusals = append(report.Refusals, fmt.Sprintf("build.%s.%s: %v", field, key, err))
				continue
			}
			if normalised["id"] != key {
				report.Refusals = append(report.Refusals,
					fmt.Sprintf("build.%s.%s: the row's id reads as %q", field, key, normalised["id"]))
				continue
			}
			if !wronglyTyped(stored, normalised) {
				continue
			}
			set["build."+field+"."+key] = normalised
			report.Normalised++
		}
	}
	return set, report
}

// normalisedRow reads a stored row through its model and answers the row as that model writes it.
func normalisedRow(field string, stored bson.M) (bson.M, error) {
	raw, err := bson.Marshal(stored)
	if err != nil {
		return nil, err
	}

	var model any
	switch field {
	case "extrasCosts":
		model = &models.ExtraCost{}
	case "inventionEntries":
		model = &models.InventionEntry{}
	default:
		return nil, fmt.Errorf("no model for %s", field)
	}
	if err := bson.Unmarshal(raw, model); err != nil {
		return nil, err
	}

	written, err := bson.Marshal(model)
	if err != nil {
		return nil, err
	}
	var out bson.M
	if err := bson.Unmarshal(written, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// wronglyTyped reports whether any field the stored row holds reads differently once its model has
// written it, which is a value stored in a type the model does not write.
func wronglyTyped(stored, normalised bson.M) bool {
	for name, value := range stored {
		written, held := normalised[name]
		if held && !sameRow(value, written) {
			return true
		}
	}
	return false
}
