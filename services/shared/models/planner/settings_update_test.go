package planner

import (
	"fmt"
	"strings"
	"testing"

	"eve-industry-planner/shared/models"
)

func categories(rows ...models.ExtraCategory) *[]models.ExtraCategory {
	list := append(models.DefaultExtrasCategories(), rows...)
	return &list
}

func TestSettingsUpdateFieldsCarriesOnlyWhatWasSet(t *testing.T) {
	t.Parallel()

	if fields := (SettingsUpdate{}).Fields(); len(fields) != 0 {
		t.Fatalf("Fields() = %v, want empty for an update that names nothing", fields)
	}

	fields := SettingsUpdate{ExtrasCategories: categories()}.Fields()
	if len(fields) != 1 {
		t.Fatalf("Fields() = %v, want only the categories", fields)
	}
	if _, ok := fields[fieldExtrasCategories]; !ok {
		t.Fatalf("Fields() = %v, want a %s entry", fields, fieldExtrasCategories)
	}
}

func TestSettingsUpdateValidate(t *testing.T) {
	t.Parallel()

	tooLong := make([]models.ExtraCategory, 0, maxExtrasCategories+1)
	for i := range cap(tooLong) {
		tooLong = append(tooLong, models.ExtraCategory{ID: string(rune('a'+i%26)) + string(rune('a'+i/26)), Label: "x"})
	}

	deletedPermanent := models.DefaultExtrasCategories()
	deletedPermanent[0].Deleted = true

	withoutOther := models.DefaultExtrasCategories()[:5]

	// The boundary itself is accepted; only a list past it is refused.
	atTheLimit := models.DefaultExtrasCategories()
	for i := len(atTheLimit); i < maxExtrasCategories; i++ {
		atTheLimit = append(atTheLimit,
			models.ExtraCategory{ID: fmt.Sprintf("filler-%d", i), Label: "Filler"})
	}

	for _, tc := range []struct {
		name   string
		update SettingsUpdate
		wantOK bool
	}{
		{"nothing to change", SettingsUpdate{}, true},
		{"the defaults", SettingsUpdate{ExtrasCategories: categories()}, true},
		{"a custom category", SettingsUpdate{ExtrasCategories: categories(
			models.ExtraCategory{ID: "d3c1", Label: "Courier"})}, true},
		{"an empty id", SettingsUpdate{ExtrasCategories: categories(
			models.ExtraCategory{ID: "  ", Label: "Courier"})}, false},
		{"a duplicate id", SettingsUpdate{ExtrasCategories: categories(
			models.ExtraCategory{ID: "0", Label: "Courier"})}, false},
		{"an empty label", SettingsUpdate{ExtrasCategories: categories(
			models.ExtraCategory{ID: "d3c1", Label: " "})}, false},
		{"a label too long", SettingsUpdate{ExtrasCategories: categories(
			models.ExtraCategory{ID: "d3c1", Label: string(make([]byte, maxExtrasCategoryLabel+1))})}, false},
		{"more categories than allowed", SettingsUpdate{ExtrasCategories: &tooLong}, false},
		{"as many categories as are allowed", SettingsUpdate{ExtrasCategories: &atTheLimit}, true},
		{"a label of exactly the length allowed", SettingsUpdate{ExtrasCategories: categories(
			models.ExtraCategory{ID: "d3c1", Label: strings.Repeat("x", maxExtrasCategoryLabel)})}, true},
		{"a permanent category deleted", SettingsUpdate{ExtrasCategories: &deletedPermanent}, false},
		{"a permanent category missing", SettingsUpdate{ExtrasCategories: &withoutOther}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := tc.update.Validate()
			if tc.wantOK && err != nil {
				t.Fatalf("Validate() = %v, want it accepted", err)
			}
			if !tc.wantOK && err == nil {
				t.Fatal("Validate() accepted an update that would break the stored costs")
			}
		})
	}
}
