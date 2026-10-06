package planner

import (
	"math"
	"os"
	"regexp"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

func TestDefaultReprocessingSettingsAreValidAndWriteAnEmptyList(t *testing.T) {
	t.Parallel()

	settings := DefaultReprocessingSettings()
	if err := settings.Validate(); err != nil {
		t.Fatalf("Validate() = %v, want the defaults accepted", err)
	}
	if settings.NeverChoose == nil {
		t.Error("never choose must be an empty slice rather than nil")
	}
	if settings.CompressedOre != CompressedOrePrefer {
		t.Errorf("compressed ore = %q, want %q", settings.CompressedOre, CompressedOrePrefer)
	}
}

func TestReprocessingSettingsValidate(t *testing.T) {
	t.Parallel()

	tooMany := make([]int, maxNeverChoose+1)
	for i := range tooMany {
		tooMany[i] = i + 1
	}
	withOne := func(change func(*ReprocessingSettings)) ReprocessingSettings {
		settings := DefaultReprocessingSettings()
		change(&settings)
		return settings
	}

	for _, tc := range []struct {
		name     string
		settings ReprocessingSettings
		wantOK   bool
	}{
		{"the defaults", DefaultReprocessingSettings(), true},
		{"avoiding compressed ore", withOne(func(s *ReprocessingSettings) { s.CompressedOre = CompressedOreAvoid }), true},
		{"a fixed shipping amount", withOne(func(s *ReprocessingSettings) {
			s.Shipping = ReprocessingShipping{Mode: ShippingFixed, Amount: 25_000_000}
		}), true},
		{"ore never to choose", withOne(func(s *ReprocessingSettings) { s.NeverChoose = []int{1230, 62516} }), true},
		{"every switch on", withOne(func(s *ReprocessingSettings) {
			s.BuyOutright = true
			s.CountLeftoversAsSold = true
		}), true},
		{"no compressed ore choice", withOne(func(s *ReprocessingSettings) { s.CompressedOre = "" }), false},
		{"an unknown compressed ore choice", withOne(func(s *ReprocessingSettings) { s.CompressedOre = "always" }), false},
		{"no shipping mode", withOne(func(s *ReprocessingSettings) { s.Shipping.Mode = "" }), false},
		{"a negative shipping amount", withOne(func(s *ReprocessingSettings) { s.Shipping.Amount = -1 }), false},
		{"a shipping amount that is not a number", withOne(func(s *ReprocessingSettings) { s.Shipping.Amount = math.NaN() }), false},
		{"an infinite shipping amount", withOne(func(s *ReprocessingSettings) { s.Shipping.Amount = math.Inf(1) }), false},
		{"a missing never-choose list", withOne(func(s *ReprocessingSettings) { s.NeverChoose = nil }), false},
		{"a never-choose list past the limit", withOne(func(s *ReprocessingSettings) { s.NeverChoose = tooMany }), false},
		{"a never-choose entry that is not a type id", withOne(func(s *ReprocessingSettings) { s.NeverChoose = []int{0} }), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := tc.settings.Validate()
			if (err == nil) != tc.wantOK {
				t.Fatalf("Validate() = %v, want ok=%v", err, tc.wantOK)
			}
		})
	}
}

func TestSettingsUpdateCarriesTheReprocessingSettingsAlone(t *testing.T) {
	t.Parallel()

	settings := DefaultReprocessingSettings()
	fields := SettingsUpdate{ReprocessingSettings: &settings}.Fields()
	if len(fields) != 1 {
		t.Fatalf("Fields() = %v, want only the reprocessing settings", fields)
	}
	if _, ok := fields[fieldReprocessingSettings]; !ok {
		t.Fatalf("Fields() = %v, want a %s entry", fields, fieldReprocessingSettings)
	}
}

func TestSettingsUpdateRefusesReprocessingSettingsTheModelRefuses(t *testing.T) {
	t.Parallel()

	settings := DefaultReprocessingSettings()
	settings.Shipping.Mode = "byJump"
	if err := (SettingsUpdate{ReprocessingSettings: &settings}).Validate(); err == nil {
		t.Fatal("Validate() accepted a shipping mode the model refuses")
	}
}

func TestASeededPlannerStartsOnTheDefaultReprocessingSettings(t *testing.T) {
	t.Parallel()

	now := time.Unix(1700000000, 0).UTC()
	seeded := SettingsFromAccount(models.AccountOwner("acct-1"), models.DefaultApplicationSettings("acct-1", now), now)
	if err := seeded.ReprocessingSettings.Validate(); err != nil {
		t.Fatalf("seeded reprocessing settings refused: %v", err)
	}
	if seeded.ReprocessingSettings.CompressedOre != CompressedOrePrefer {
		t.Errorf("compressed ore = %q, want the default", seeded.ReprocessingSettings.CompressedOre)
	}
}

const spaDefaultValuesPath = "../../../../frontend/src/Context/defaultValues.jsx"

var spaStringEntry = regexp.MustCompile(`(\w+):\s*"(\w+)"`)

func spaStringBlock(t *testing.T, name string) map[string]string {
	t.Helper()
	source, err := os.ReadFile(spaDefaultValuesPath)
	if err != nil {
		t.Fatalf("reading the SPA defaults: %v", err)
	}
	block := regexp.MustCompile(`(?s)export const ` + name + ` = \{(.*?)\};`).FindSubmatch(source)
	if block == nil {
		t.Fatalf("%s not found where this test looks for it", name)
	}
	entries := make(map[string]string)
	for _, entry := range spaStringEntry.FindAllSubmatch(block[1], -1) {
		entries[string(entry[1])] = string(entry[2])
	}
	return entries
}

func TestSPAAndServerAgreeOnTheReprocessingChoices(t *testing.T) {
	t.Parallel()

	for name, server := range map[string][]string{
		"compressedOreChoices": {CompressedOrePrefer, CompressedOreAllow, CompressedOreAvoid},
		"shippingModes":        {ShippingPerVolume, ShippingFixed},
	} {
		spa := spaStringBlock(t, name)
		if len(spa) != len(server) {
			t.Errorf("%s: the SPA names %v; the server names %v", name, spa, server)
		}
		for _, value := range server {
			if spa[value] != value {
				t.Errorf("%s: the server names %q and the SPA does not", name, value)
			}
		}
	}
}

func TestSPAAndServerStartAPlannerOnTheSameReprocessingSettings(t *testing.T) {
	t.Parallel()

	source, err := os.ReadFile(spaDefaultValuesPath)
	if err != nil {
		t.Fatalf("reading the SPA defaults: %v", err)
	}
	block := regexp.MustCompile(`(?s)export function defaultPlannerReprocessingSettings\(\) \{(.*?)\n\}`).FindSubmatch(source)
	if block == nil {
		t.Fatal("defaultPlannerReprocessingSettings not found where this test looks for it")
	}
	read := func(pattern string) string {
		match := regexp.MustCompile(pattern).FindSubmatch(block[1])
		if match == nil {
			t.Fatalf("%s not found in the SPA defaults", pattern)
		}
		return string(match[1])
	}

	server := DefaultReprocessingSettings()
	if choice := spaStringBlock(t, "compressedOreChoices")[read(`compressedOre:\s*compressedOreChoices\.(\w+)`)]; choice != server.CompressedOre {
		t.Errorf("compressed ore starts as %q in the SPA and %q on the server", choice, server.CompressedOre)
	}
	if mode := spaStringBlock(t, "shippingModes")[read(`mode:\s*shippingModes\.(\w+)`)]; mode != server.Shipping.Mode {
		t.Errorf("shipping starts as %q in the SPA and %q on the server", mode, server.Shipping.Mode)
	}
	if amount := read(`amount:\s*([\d.]+)`); amount != "0" || server.Shipping.Amount != 0 {
		t.Errorf("shipping amount starts at %s in the SPA and %v on the server", amount, server.Shipping.Amount)
	}
	for _, off := range []string{"countLeftoversAsSold", "buyOutright"} {
		if value := read(off + `:\s*(\w+)`); value != "false" {
			t.Errorf("%s starts %s in the SPA and off on the server", off, value)
		}
	}
	if read(`neverChoose:\s*(\[\])`) != "[]" || len(server.NeverChoose) != 0 {
		t.Error("never choose must start empty on both sides")
	}
}
