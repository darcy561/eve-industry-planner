package commands

import (
	"context"
	"fmt"
	"strings"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// zarzakhSystemID is the solar system The Fulcrum sits in.
const zarzakhSystemID = 30100000

// theFulcrumStructureID is the structure a setup names to say it builds at The
// Fulcrum.
const theFulcrumStructureID = 4

// clearZarzakhLeftovers unsets Zarzakh on every setup that names some other
// structure, so only a setup really at The Fulcrum is read as being there.
func clearZarzakhLeftovers(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	if clients == nil || clients.Mongo == nil {
		return "", fmt.Errorf("mongo handle is required")
	}

	reports := make([]string, 0, len(rigSlotCollections))
	for _, name := range rigSlotCollections {
		report, err := clearZarzakhLeftoversIn(ctx, clients.Mongo, name, dryRun)
		if err != nil {
			return "", err
		}
		reports = append(reports, report)
	}
	return strings.Join(reports, "; "), nil
}

func clearZarzakhLeftoversIn(ctx context.Context, m *eipmongo.Mongo, collection string, dryRun bool) (string, error) {
	coll := m.Coll(collection)
	if coll == nil {
		return "", fmt.Errorf("%s collection unavailable", collection)
	}

	cursor, err := coll.Find(ctx, bson.M{})
	if err != nil {
		return "", fmt.Errorf("read %s for a Zarzakh sweep: %w", collection, err)
	}
	defer cursor.Close(ctx)

	var cleared, setups int
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return "", fmt.Errorf("decode a %s document: %w", collection, err)
		}

		changed := clearZarzakhLeftoversInDocument(collection, doc)
		if changed == 0 {
			continue
		}
		cleared++
		setups += changed

		if dryRun {
			continue
		}
		if err := writeFoldedRigSlots(ctx, coll, collection, doc); err != nil {
			return "", err
		}
	}
	if err := cursor.Err(); err != nil {
		return "", fmt.Errorf("iterate %s for a Zarzakh sweep: %w", collection, err)
	}

	if cleared == 0 {
		return fmt.Sprintf("%s: none carries a Zarzakh leftover", collection), nil
	}
	verb := "cleared"
	if dryRun {
		verb = "would be cleared"
	}
	return fmt.Sprintf("%s: %d setup(s) across %d document(s) %s",
		collection, setups, cleared, verb), nil
}

// clearZarzakhLeftoversInDocument clears every setup the document holds,
// returning how many it changed.
func clearZarzakhLeftoversInDocument(collection string, doc bson.M) int {
	if collection == eipmongo.CollectionGroupTemplatePayloads {
		var changed int
		for _, node := range asArray(doc["jobs"]) {
			for _, setup := range asArray(asDocument(node)["presetSetups"]) {
				if clearSetupZarzakhLeftover(asDocument(setup)) {
					changed++
				}
			}
		}
		return changed
	}

	var changed int
	for _, setup := range asDocument(asDocument(doc["build"])["setup"]) {
		if clearSetupZarzakhLeftover(asDocument(setup)) {
			changed++
		}
	}
	return changed
}

// clearSetupZarzakhLeftover clears one setup's leftover system, and reports
// whether it changed anything.
func clearSetupZarzakhLeftover(setup bson.M) bool {
	if setup == nil {
		return false
	}
	if int(asInt64(setup["systemID"])) != zarzakhSystemID {
		return false
	}
	if int(asInt64(setup["structureID"])) == theFulcrumStructureID {
		return false
	}

	setup["systemID"] = 0
	return true
}
