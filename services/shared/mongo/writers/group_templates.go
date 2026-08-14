package writers

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// CreateGroupTemplate inserts the payload doc then pushes the catalog entry (ordered).
// Callers map mongo.IsDuplicateKeyError to conflict responses.
func CreateGroupTemplate(ctx context.Context, m *eipmongo.Mongo, accountID string, entry models.TemplateCatalogEntry, payloadDoc bson.M) error {
	if m == nil || accountID == "" {
		return fmt.Errorf("CreateGroupTemplate: mongo and accountID are required")
	}
	bulk := m.Bulk().
		InsertOne(m.TemplatePayloads, payloadDoc).
		UpdateOne(m.TemplateCatalog, bson.M{"_id": accountID}, bson.M{
			"$push": bson.M{"templates": entry},
			"$inc":  bson.M{"catalogVersion": 1},
			"$set": bson.M{
				"schemaVersion": models.GroupTemplateCatalogSchemaVersion,
				"documentKind":  models.GroupTemplateCatalogDocumentKind,
			},
		})
	_, err := RunOrdered(ctx, fmt.Sprintf("group_templates create %s", accountID), bulk)
	return err
}

// ReplaceGroupTemplatePayload replaces the payload and updates the matching catalog entry (ordered).
func ReplaceGroupTemplatePayload(ctx context.Context, m *eipmongo.Mongo, accountID, templateID string, entry models.TemplateCatalogEntry, payloadDoc bson.M) error {
	if m == nil || accountID == "" || templateID == "" {
		return fmt.Errorf("ReplaceGroupTemplatePayload: mongo, accountID, and templateID are required")
	}
	bulk := m.Bulk().
		ReplaceOne(m.TemplatePayloads, bson.M{"_id": templateID, "accountID": accountID}, payloadDoc, eipmongo.Upsert()).
		UpdateOne(m.TemplateCatalog, bson.M{"_id": accountID}, bson.M{
			"$set": bson.M{"templates.$[t]": entry},
			"$inc": bson.M{"catalogVersion": 1},
		}, eipmongo.ArrayFilters(bson.M{"t.templateID": templateID}))
	_, err := RunOrdered(ctx, fmt.Sprintf("group_templates replace payload %s", templateID), bulk)
	return err
}

// DeleteGroupTemplate deletes the payload then pulls the catalog entry (ordered).
// Returns the bulk result so callers can treat DeletedCount==0 as not found.
func DeleteGroupTemplate(ctx context.Context, m *eipmongo.Mongo, accountID, templateID string) (*mongo.ClientBulkWriteResult, error) {
	if m == nil || accountID == "" || templateID == "" {
		return nil, fmt.Errorf("DeleteGroupTemplate: mongo, accountID, and templateID are required")
	}
	bulk := m.Bulk().
		DeleteOne(m.TemplatePayloads, bson.M{"_id": templateID, "accountID": accountID}).
		UpdateOne(m.TemplateCatalog, bson.M{"_id": accountID}, bson.M{
			"$pull": bson.M{"templates": bson.M{"templateID": templateID}},
			"$inc":  bson.M{"catalogVersion": 1},
		})
	return RunOrdered(ctx, fmt.Sprintf("group_templates delete %s", templateID), bulk)
}
