package mongo

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
)

// The guards answer before the collection handle is touched, which is what lets
// every caller pass whatever it was given without checking first.
func TestUpdatePlannerSettingsRefusesArgumentsItCannotUse(t *testing.T) {
	t.Parallel()

	categories := models.DefaultExtrasCategories()
	withCategories := planner.SettingsUpdate{ExtrasCategories: &categories}
	owner := models.AccountOwner("acct-1")

	for _, tc := range []struct {
		name   string
		mongo  *Mongo
		owner  models.Owner
		update planner.SettingsUpdate
	}{
		{"no mongo handle", nil, owner, withCategories},
		{"no owner to address", &Mongo{}, models.Owner{}, withCategories},
		{"an update naming no setting", &Mongo{}, owner, planner.SettingsUpdate{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := tc.mongo.UpdatePlannerSettings(context.Background(), tc.owner, tc.update,
				models.MetaData{}, time.Now().UTC())
			if err == nil {
				t.Fatal("UpdatePlannerSettings accepted arguments it cannot write with")
			}
		})
	}
}
