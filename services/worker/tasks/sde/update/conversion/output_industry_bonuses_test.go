package conversion

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func dogmaAttr(attributeID int, value float64) map[string]any {
	return map[string]any{"attributeID": float64(attributeID), "value": value}
}

func dogmaEffect(effectID int) map[string]any {
	return map[string]any{"effectID": float64(effectID)}
}

func modifier(named, from int) map[string]any {
	return map[string]any{
		"modifiedAttributeID":  float64(named),
		"modifyingAttributeID": float64(from),
	}
}

func axisEntry(attributeID, filterID int) map[string]any {
	entry := map[string]any{"dogmaAttributeID": float64(attributeID)}
	if filterID != 0 {
		entry["filterID"] = float64(filterID)
	}
	return entry
}

func rigFixtures() (types, groups, typeDogma, effects, sources, filters map[string]any) {
	types = map[string]any{
		"1": map[string]any{"groupID": float64(1860), "name": map[string]any{OutputLocale: "Standup L-Set Advanced Component Manufacturing Efficiency I"}},
		"2": map[string]any{"groupID": float64(1860), "name": map[string]any{OutputLocale: "Standup L-Set Thukker Advanced Component Manufacturing Efficiency"}},
	}
	groups = map[string]any{
		"1860": map[string]any{"categoryID": float64(structureModuleCategoryID)},
		"1404": map[string]any{"categoryID": float64(structureCategoryID)},
		"1984": map[string]any{"categoryID": float64(structureModuleCategoryID)},
	}
	typeDogma = map[string]any{
		"1": map[string]any{
			"dogmaAttributes": []any{
				dogmaAttr(rigSizeAttribute, 3),
				dogmaAttr(hiSecModifierAttribute, 1.0),
				dogmaAttr(lowSecModifierAttribute, 1.9),
				dogmaAttr(nullSecModifierAttribute, 2.1),
				dogmaAttr(2594, -2.0),
			},
			"dogmaEffects": []any{dogmaEffect(6824), dogmaEffect(6888)},
		},
		"2": map[string]any{
			"dogmaAttributes": []any{
				dogmaAttr(rigSizeAttribute, 3),
				dogmaAttr(hiSecModifierAttribute, 0.1),
				dogmaAttr(lowSecModifierAttribute, 1.9),
				dogmaAttr(nullSecModifierAttribute, 0.1),
				dogmaAttr(2594, -2.0),
				dogmaAttr(2653, -3.7),
			},
			"dogmaEffects": []any{dogmaEffect(6824), dogmaEffect(6890)},
		},
	}
	effects = map[string]any{
		"6824": map[string]any{"modifierInfo": []any{modifier(2557, 2594)}},
		"6888": map[string]any{"modifierInfo": []any{modifier(2658, 2594)}},
		"6890": map[string]any{"modifierInfo": []any{modifier(2658, 2653)}},
	}
	source := map[string]any{
		"manufacturing": map[string]any{
			"material": []any{axisEntry(2557, 14), axisEntry(2658, 15)},
		},
	}
	sources = map[string]any{"1": source, "2": source}
	filters = map[string]any{
		"14": map[string]any{"name": "Components", "groupIDs": []any{float64(334)}},
		"15": map[string]any{"name": "Advanced Capital Components", "groupIDs": []any{float64(913)}},
	}
	return types, groups, typeDogma, effects, sources, filters
}

func TestIndustryBonusesReadEachSourcesFigureFromItsOwnEffect(t *testing.T) {
	t.Parallel()

	catalogue := GenerateIndustryBonusesOutput(rigFixtures())

	standard := catalogue.Sources["1"]
	thukker := catalogue.Sources["2"]
	if standard == nil || thukker == nil {
		t.Fatalf("both rigs should be catalogued, got %d", len(catalogue.Sources))
	}

	wantStandard := []IndustryBonus{
		{Activity: "manufacturing", Axis: "material", FamilyID: 14, Value: 2.0},
		{Activity: "manufacturing", Axis: "material", FamilyID: 15, Value: 2.0},
	}
	wantThukker := []IndustryBonus{
		{Activity: "manufacturing", Axis: "material", FamilyID: 14, Value: 2.0},
		{Activity: "manufacturing", Axis: "material", FamilyID: 15, Value: 3.7},
	}
	if !reflect.DeepEqual(standard.Bonuses, wantStandard) {
		t.Errorf("standard bonuses = %+v, want %+v", standard.Bonuses, wantStandard)
	}
	if !reflect.DeepEqual(thukker.Bonuses, wantThukker) {
		t.Errorf("thukker bonuses = %+v, want %+v", thukker.Bonuses, wantThukker)
	}
}

func TestASourceOnSeveralActivitiesKeepsThemApart(t *testing.T) {
	t.Parallel()

	types, groups, typeDogma, effects, _, filters := rigFixtures()
	sources := map[string]any{"1": map[string]any{
		"invention":        map[string]any{"time": []any{axisEntry(2557, 0)}},
		"copying":          map[string]any{"time": []any{axisEntry(2557, 0)}},
		"researchMaterial": map[string]any{"time": []any{axisEntry(2557, 0)}},
	}}

	catalogue := GenerateIndustryBonusesOutput(types, groups, typeDogma, effects, sources, filters)

	want := []IndustryBonus{
		{Activity: "copying", Axis: "time", Value: 2.0},
		{Activity: "invention", Axis: "time", Value: 2.0},
		{Activity: "researchMaterial", Axis: "time", Value: 2.0},
	}
	if got := catalogue.Sources["1"].Bonuses; !reflect.DeepEqual(got, want) {
		t.Errorf("bonuses = %+v, want one per activity: %+v", got, want)
	}
}

func TestTheCatalogueIsTheSameEveryBuild(t *testing.T) {
	t.Parallel()

	types, groups, typeDogma, effects, _, filters := rigFixtures()
	sources := map[string]any{"1": map[string]any{
		"invention":        map[string]any{"time": []any{axisEntry(2557, 0)}},
		"copying":          map[string]any{"time": []any{axisEntry(2557, 0)}},
		"researchMaterial": map[string]any{"time": []any{axisEntry(2557, 0)}},
		"researchTime":     map[string]any{"time": []any{axisEntry(2557, 0)}},
	}}

	first := GenerateIndustryBonusesOutput(types, groups, typeDogma, effects, sources, filters)
	for range 20 {
		again := GenerateIndustryBonusesOutput(types, groups, typeDogma, effects, sources, filters)
		if !reflect.DeepEqual(first, again) {
			t.Fatalf("a second build differs:\n%+v\n%+v", first.Sources["1"], again.Sources["1"])
		}
	}
}

func TestAStructureCarriesTheFigureOnItsOwnAttribute(t *testing.T) {
	t.Parallel()

	types, groups, _, _, _, filters := rigFixtures()
	types["3"] = map[string]any{"groupID": float64(1404), "name": map[string]any{OutputLocale: "Raitaru"}}
	typeDogma := map[string]any{"3": map[string]any{
		"dogmaAttributes": []any{dogmaAttr(2600, -0.99), dogmaAttr(2602, -0.85)},
		"dogmaEffects":    []any{},
	}}
	sources := map[string]any{"3": map[string]any{"manufacturing": map[string]any{
		"material": []any{axisEntry(2600, 0)},
		"time":     []any{axisEntry(2602, 0)},
	}}}

	catalogue := GenerateIndustryBonusesOutput(types, groups, typeDogma, map[string]any{}, sources, filters)

	structure := catalogue.Sources["3"]
	if structure == nil {
		t.Fatal("a structure that carries its own figure should be catalogued")
	}
	if structure.Kind != IndustryKindStructure {
		t.Errorf("kind = %q, want a structure", structure.Kind)
	}
	want := []IndustryBonus{
		{Activity: "manufacturing", Axis: "material", Value: 0.99},
		{Activity: "manufacturing", Axis: "time", Value: 0.85},
	}
	if !reflect.DeepEqual(structure.Bonuses, want) {
		t.Errorf("bonuses = %+v, want %+v", structure.Bonuses, want)
	}
}

func TestAnOutpostRigIsSetApartFromARig(t *testing.T) {
	t.Parallel()

	types, groups, typeDogma, effects, sources, filters := rigFixtures()
	types["1"].(map[string]any)["groupID"] = float64(outpostConversionRigGroup)

	catalogue := GenerateIndustryBonusesOutput(types, groups, typeDogma, effects, sources, filters)

	if got := catalogue.Sources["1"].Kind; got != IndustryKindOutpostRig {
		t.Errorf("kind = %q, want an outpost rig", got)
	}
	if got := catalogue.Sources["2"].Kind; got != IndustryKindRig {
		t.Errorf("kind = %q, want a rig", got)
	}
}

func TestIndustryBonusesPublishTheirOwnSecurityMultipliers(t *testing.T) {
	t.Parallel()

	catalogue := GenerateIndustryBonusesOutput(rigFixtures())

	if got := catalogue.Sources["1"].Security; got["hiSec"] != 1.0 || got["nullSec"] != 2.1 {
		t.Errorf("standard security = %v, want the 1/1.9/2.1 trio", got)
	}
	if got := catalogue.Sources["2"].Security; got["hiSec"] != 0.1 || got["nullSec"] != 0.1 {
		t.Errorf("thukker security = %v, want its own 0.1/1.9/0.1 trio", got)
	}
}

func TestIndustryBonusLabelsDropTheSizeAndTheActivity(t *testing.T) {
	t.Parallel()

	catalogue := GenerateIndustryBonusesOutput(rigFixtures())

	if got := catalogue.Sources["1"].Label; got != "Advanced Component Efficiency I" {
		t.Errorf("label = %q", got)
	}
	if got := catalogue.Sources["2"].Label; got != "Thukker Advanced Component Efficiency" {
		t.Errorf("label = %q", got)
	}
}

func TestIndustryRigsCarryTheStructureSizeTheyFit(t *testing.T) {
	t.Parallel()

	catalogue := GenerateIndustryBonusesOutput(rigFixtures())

	if got := catalogue.Sources["1"].Size; got != 3 {
		t.Errorf("size = %d, want 3 for an L-Set", got)
	}
	if got := catalogue.Sources["1"].GroupID; got != 1860 {
		t.Errorf("group = %d, want the group two rigs compete through", got)
	}
}

func TestIndustryFamiliesCarryWhatTheGameScopesBy(t *testing.T) {
	t.Parallel()

	catalogue := GenerateIndustryBonusesOutput(rigFixtures())

	family := catalogue.Families["14"]
	if family == nil || family.Name != "Components" || len(family.GroupIDs) != 1 {
		t.Fatalf("family 14 = %+v", family)
	}
	if family.GroupIDs[0] != 334 {
		t.Errorf("group ids = %v", family.GroupIDs)
	}
}

func TestASourceWithNoResolvableFigureIsLeftOut(t *testing.T) {
	t.Parallel()

	types, groups, typeDogma, _, sources, filters := rigFixtures()

	catalogue := GenerateIndustryBonusesOutput(types, groups, typeDogma, map[string]any{}, sources, filters)

	if len(catalogue.Sources) != 0 {
		t.Errorf("catalogued %d sources with no effects to resolve them", len(catalogue.Sources))
	}
	if len(catalogue.Families) != 2 {
		t.Errorf("families should still be published, got %d", len(catalogue.Families))
	}
}

func TestAReprocessingRigIsCataloguedFromItsYield(t *testing.T) {
	t.Parallel()

	types, groups, _, _, _, filters := rigFixtures()
	types["4"] = map[string]any{
		"published": true,
		"groupID":   float64(1941),
		"name":      map[string]any{OutputLocale: "Standup M-Set Asteroid Ore Grading Processor I"},
	}
	groups["1941"] = map[string]any{
		"categoryID": float64(structureModuleCategoryID),
		"name":       map[string]any{OutputLocale: "Structure Resource Rig M - Asteroid Ore Reprocessing"},
	}
	typeDogma := map[string]any{"4": map[string]any{
		"dogmaAttributes": []any{
			dogmaAttr(refiningYieldAttribute, 0.51),
			dogmaAttr(rigSizeAttribute, 2),
			dogmaAttr(hiSecModifierAttribute, 1.0),
			dogmaAttr(lowSecModifierAttribute, 1.06),
			dogmaAttr(nullSecModifierAttribute, 1.12),
		},
	}}

	catalogue := GenerateIndustryBonusesOutput(
		types, groups, typeDogma, map[string]any{}, map[string]any{}, filters)

	rig := catalogue.Sources["4"]
	if rig == nil {
		t.Fatal("a reprocessing rig should be catalogued from its refining yield")
	}
	want := []IndustryBonus{{
		Activity: "reprocessing",
		Axis:     "value",
		Family:   "Structure Resource Rig M - Asteroid Ore Reprocessing",
		Value:    1,
	}}
	if !reflect.DeepEqual(rig.Bonuses, want) {
		t.Errorf("bonuses = %+v, want %+v", rig.Bonuses, want)
	}
	if rig.Size != 2 || rig.Security["nullSec"] != 1.12 {
		t.Errorf("size = %d, security = %v", rig.Size, rig.Security)
	}
}

func TestARetiredReprocessingRigIsNotCatalogued(t *testing.T) {
	t.Parallel()

	types, groups, _, _, _, filters := rigFixtures()
	types["6"] = map[string]any{
		"published": false,
		"groupID":   float64(1941),
		"name":      map[string]any{OutputLocale: "OLD L-Set Ore Grading Processor I"},
	}
	groups["1941"] = map[string]any{"categoryID": float64(structureModuleCategoryID)}
	typeDogma := map[string]any{"6": map[string]any{
		"dogmaAttributes": []any{dogmaAttr(refiningYieldAttribute, 0.52)},
	}}

	catalogue := GenerateIndustryBonusesOutput(
		types, groups, typeDogma, map[string]any{}, map[string]any{}, filters)

	if _, held := catalogue.Sources["6"]; held {
		t.Error("a rig the game no longer publishes should not be offered")
	}
}

func TestARigWithNoYieldAboveTheBaseIsNotCatalogued(t *testing.T) {
	t.Parallel()

	types, groups, _, _, _, filters := rigFixtures()
	types["5"] = map[string]any{
		"published": true,
		"groupID":   float64(1941),
		"name":      map[string]any{OutputLocale: "Standup Reprocessing Facility I"},
	}
	groups["1941"] = map[string]any{"categoryID": float64(structureModuleCategoryID)}
	typeDogma := map[string]any{"5": map[string]any{
		"dogmaAttributes": []any{dogmaAttr(refiningYieldAttribute, 0.5)},
	}}

	catalogue := GenerateIndustryBonusesOutput(
		types, groups, typeDogma, map[string]any{}, map[string]any{}, filters)

	if _, held := catalogue.Sources["5"]; held {
		t.Error("a service module giving the base yield is not a rig bonus")
	}
}

func TestIndustryBonusesFromTheSDEExtract(t *testing.T) {
	t.Parallel()

	extractDir := os.Getenv("SDE_EXTRACT_DIR")
	if extractDir == "" {
		extractDir = "/tmp/sde_extract"
	}
	if _, err := os.Stat(filepath.Join(extractDir, "industryModifierSources.jsonl")); err != nil {
		t.Skipf("SDE extract not found at %s", extractDir)
	}

	load := func(name string) map[string]any {
		rows, err := parseJSONLFile(filepath.Join(extractDir, name))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		return rows
	}

	catalogue := GenerateIndustryBonusesOutput(
		load("types.jsonl"),
		load("groups.jsonl"),
		load("typeDogma.jsonl"),
		load("dogmaEffects.jsonl"),
		load("industryModifierSources.jsonl"),
		load("industryTargetFilters.jsonl"),
	)

	if len(catalogue.Families) != 18 {
		t.Errorf("families = %d, want the 18 the game publishes", len(catalogue.Families))
	}

	byKind := map[string]int{}
	for _, source := range catalogue.Sources {
		byKind[source.Kind]++
	}
	if byKind[IndustryKindRig] != 135 {
		t.Errorf("rigs = %d, want 125 industry rigs and 10 reprocessing ones", byKind[IndustryKindRig])
	}

	reprocessing := 0
	for _, source := range catalogue.Sources {
		for _, bonus := range source.Bonuses {
			if bonus.Activity == "reprocessing" {
				reprocessing++
			}
		}
	}
	if reprocessing != 10 {
		t.Errorf("reprocessing rigs = %d, want 10", reprocessing)
	}
	if byKind[IndustryKindStructure] < 4 {
		t.Errorf("structures = %d, want Raitaru, Azbel, Sotiyo and Tatara at least", byKind[IndustryKindStructure])
	}

	for _, id := range []string{"35825", "35826", "35827"} {
		structure := catalogue.Sources[id]
		if structure == nil || structure.Kind != IndustryKindStructure {
			t.Errorf("%s should be catalogued as a structure, got %+v", id, structure)
			continue
		}
		for _, bonus := range structure.Bonuses {
			if bonus.FamilyID != 0 {
				t.Errorf("%s bonus is scoped to family %d, want every item", id, bonus.FamilyID)
			}
		}
	}

	thukker := catalogue.Sources["45641"]
	if thukker == nil {
		t.Fatal("the Thukker Advanced Component rig should be catalogued")
	}
	if thukker.Label != "Thukker Advanced Component Efficiency" {
		t.Errorf("label = %q", thukker.Label)
	}
	if thukker.Security["hiSec"] != 0.1 || thukker.Security["nullSec"] != 0.1 {
		t.Errorf("security = %v", thukker.Security)
	}
	var capital float64
	for _, bonus := range thukker.Bonuses {
		if bonus.Activity == "manufacturing" && bonus.Axis == "material" && bonus.FamilyID == 15 {
			capital = bonus.Value
		}
	}
	if capital != 3.7 {
		t.Errorf("advanced capital component material bonus = %v, want 3.7", capital)
	}

	for id, source := range catalogue.Sources {
		seen := map[IndustryBonus]bool{}
		for _, bonus := range source.Bonuses {
			if seen[bonus] {
				t.Errorf("%s repeats bonus %+v", id, bonus)
			}
			seen[bonus] = true
		}
	}
}
