package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/documentschema"
	"eve-industry-planner/shared/models"
)

// LoadUserAccount loads users/_id, upgrades schema if needed, and persists upgrades.
func (m *Mongo) LoadUserAccount(ctx context.Context, accountID string) (models.UserAccountDocument, error) {
	if m == nil || accountID == "" {
		return models.UserAccountDocument{}, fmt.Errorf("LoadUserAccount: invalid arguments")
	}
	users := m.Users
	doc, err := findOne[models.UserAccountDocument](ctx, users, "LoadUserAccount", AccountDocumentFilter(accountID))
	if err != nil {
		return models.UserAccountDocument{}, err
	}
	beforeSchemaVersion := doc.SchemaVersion
	documentschema.Upgrader{}.UserAccountDocument(&doc)
	if beforeSchemaVersion != doc.SchemaVersion {
		if _, _, err := users.UpsertUserAccount(ctx, accountID, doc); err != nil {
			return models.UserAccountDocument{}, fmt.Errorf("persist upgraded user document: %w", err)
		}
	}
	return doc, nil
}

// LoadApplicationSettings loads application_settings, upgrades schema if needed, and persists upgrades.
func (m *Mongo) LoadApplicationSettings(ctx context.Context, accountID string, now time.Time) (models.ApplicationSettings, error) {
	if m == nil || accountID == "" {
		return models.ApplicationSettings{}, fmt.Errorf("LoadApplicationSettings: invalid arguments")
	}
	settings := m.ApplicationSettings
	doc, err := findOne[models.ApplicationSettings](ctx, settings, "LoadApplicationSettings", AccountDocumentFilter(accountID))
	if err != nil {
		return models.ApplicationSettings{}, err
	}
	beforeSchemaVersion := doc.SchemaVersion
	documentschema.Upgrader{}.ApplicationSettings(&doc, accountID, now)
	if beforeSchemaVersion != doc.SchemaVersion {
		if _, _, err := settings.UpsertApplicationSettings(ctx, accountID, doc); err != nil {
			return models.ApplicationSettings{}, fmt.Errorf("persist upgraded application settings: %w", err)
		}
	}
	return doc, nil
}
