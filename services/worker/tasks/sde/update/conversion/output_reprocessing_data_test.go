package conversion

import (
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"eve-industry-planner/shared/jsoncodec"
)

func fixedMaterials(pairs ...float64) map[string]any {
	var list []any
	for i := 0; i+1 < len(pairs); i += 2 {
		list = append(list, map[string]any{"materialTypeID": pairs[i], "quantity": pairs[i+1]})
	}
	return map[string]any{"materials": list}
}

func randomMaterials(triples ...float64) map[string]any {
	var list []any
	for i := 0; i+2 < len(triples); i += 3 {
		list = append(list, map[string]any{"materialTypeID": triples[i], "quantityMin": triples[i+1], "quantityMax": triples[i+2]})
	}
	return map[string]any{"randomizedMaterials": list}
}

func reprocessingSkill(skill float64) map[string]any {
	return map[string]any{"dogmaAttributes": []any{
		map[string]any{"attributeID": float64(182), "value": float64(3386)},
		map[string]any{"attributeID": float64(reprocessingSkillTypeAttribute), "value": skill},
	}}
}

func reprocessingFixture() (map[string]any, map[string]*EVEType, map[string]any, map[string]any) {
	typeMaterials := map[string]any{
		"1230":  fixedMaterials(34, 400),
		"28432": fixedMaterials(34, 400, 35, 100),
		"45490": fixedMaterials(16634, 65),
		"62396": fixedMaterials(30375, 10),
		"88105": fixedMaterials(34, 300),
		"49787": fixedMaterials(48927, 1),
		"90041": randomMaterials(34, 368000, 496800, 11399, 312, 624),
		"90298": randomMaterials(11399, 93, 187),
		"77777": fixedMaterials(34, 1),
		"34":    map[string]any{"materials": []any{}},
	}
	types := map[string]*EVEType{
		"1230":  {Key: 1230, Name: "Veldspar", MarketSectionID: 518, PortionSize: 100, Volume: 0.1},
		"28432": {Key: 28432, Name: "Compressed Veldspar", MarketSectionID: 518, PortionSize: 100},
		"45490": {Key: 45490, Name: "Zeolites", MarketSectionID: 2396, PortionSize: 100, Volume: 10},
		"62396": {Key: 62396, Name: "Compressed Amber Cytoserocin", MarketSectionID: 2802, PortionSize: 1, Volume: 0.1},
		"88105": {Key: 88105, Name: "Tyranite", MarketSectionID: 3700, PortionSize: 100, Volume: 16},
		"49787": {Key: 49787, Name: "Hiemal Tricarboxyl Vapor", MarketSectionID: 518, PortionSize: 1, Volume: 10},
		"90041": {Key: 90041, Name: "Prismaticite", MarketSectionID: 3776, PortionSize: 100, Volume: 40},
		"90298": {Key: 90298, Name: "Unrefined Morphite", MarketSectionID: 3784, PortionSize: 100, Volume: 40},
		"77777": {Key: 77777, Name: "Unlisted Ore", PortionSize: 100, Volume: 1},
		"34":    {Key: 34, Name: "Tritanium", MarketSectionID: 1857, Volume: 0.01},
		"35":    {Key: 35, Name: "Pyerite", MarketSectionID: 1857},
		"11399": {Key: 11399, Name: "Morphite", MarketSectionID: 1857, Volume: 0.01},
	}
	group := func(parent float64) map[string]any { return map[string]any{"parentGroupID": parent} }
	marketGroups := map[string]any{
		"475":  map[string]any{},
		"533":  group(475),
		"1031": group(533),
		"54":   group(1031),
		"518":  group(54),
		"3700": group(54),
		"3776": group(54),
		"2395": group(1031),
		"2479": group(2395),
		"2396": group(2479),
		"1032": group(533),
		"2802": group(1032),
		"3784": group(1031),
		"1857": group(1031),
	}
	typeDogma := map[string]any{
		"1230":  reprocessingSkill(60377),
		"28432": reprocessingSkill(60377),
		"45490": reprocessingSkill(46152),
		"88105": reprocessingSkill(60377),
		"90041": reprocessingSkill(90040),
		"90298": reprocessingSkill(90398),
		"77777": reprocessingSkill(60377),
	}
	return typeMaterials, types, marketGroups, typeDogma
}

func generatedFixture() *ReprocessingData {
	return GenerateReprocessingDataOutput(reprocessingFixture())
}

func mustItem(t *testing.T, data *ReprocessingData, id string) *ReprocessingItem {
	t.Helper()
	item, ok := data.Items[id]
	if !ok {
		t.Fatalf("type %s missing from the items", id)
	}
	return item
}

func TestReprocessingDataCarriesEachItemsVolume(t *testing.T) {
	if got := mustItem(t, generatedFixture(), "1230").Volume; got != 0.1 {
		t.Fatalf("Veldspar volume = %v, want 0.1", got)
	}
}

func TestReprocessingDataStatesEachMaterialsVolumeOnce(t *testing.T) {
	volumes := generatedFixture().MaterialVolumes
	if volumes["34"] != 0.01 {
		t.Fatalf("Tritanium volume = %v, want 0.01", volumes["34"])
	}
	if volumes["11399"] != 0.01 {
		t.Fatalf("Morphite, given only at random, volume = %v, want 0.01", volumes["11399"])
	}
}

func TestReprocessingDataLeavesOutMaterialsAndItemsWithNoVolume(t *testing.T) {
	data := generatedFixture()
	if _, held := data.MaterialVolumes["35"]; held {
		t.Fatal("Pyerite has no volume in the SDE and must not be listed")
	}
	b, err := jsoncodec.Marshal(mustItem(t, data, "28432"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), `"volume"`) {
		t.Fatalf("an item with no volume wrote one: %s", b)
	}
}

func TestReprocessingDataFileHoldsItemsAndMaterialVolumes(t *testing.T) {
	b, err := jsoncodec.Marshal(GenerateReprocessingDataOutput(map[string]any{}, map[string]*EVEType{}, map[string]any{}, map[string]any{}))
	if err != nil {
		t.Fatal(err)
	}
	if got, want := string(b), `{"items":{},"materialVolumes":{}}`; got != want {
		t.Fatalf("empty file = %s, want %s", got, want)
	}
}

func TestReprocessingSkillIsTheTypesOwnReprocessingSkillAttribute(t *testing.T) {
	data := generatedFixture()
	for id, want := range map[string]int{"1230": 60377, "45490": 46152, "88105": 60377, "90041": 90040, "90298": 90398} {
		if got := mustItem(t, data, id).ReprocessingSkill; got != want {
			t.Errorf("type %s skill = %d, want %d", id, got, want)
		}
	}
}

func TestCompressedGasIsFoundByItsMarketBranchAndDecompressed(t *testing.T) {
	gas := mustItem(t, generatedFixture(), "62396")
	if gas.ItemType != ItemTypesForReprocessing["gas"] {
		t.Errorf("kind = %d, want gas", gas.ItemType)
	}
	if gas.ReprocessingSkill != gasDecompressionEfficiencySkill {
		t.Errorf("skill = %d, want Gas Decompression Efficiency", gas.ReprocessingSkill)
	}
}

func TestAKindIsReadFromTheWholeMarketAncestry(t *testing.T) {
	data := generatedFixture()
	if got := mustItem(t, data, "45490").ItemType; got != ItemTypesForReprocessing["moonOre"] {
		t.Errorf("Zeolites, three groups below Moon Ores, kind = %d, want moon ore", got)
	}
	if got := mustItem(t, data, "88105").ItemType; got != ItemTypesForReprocessing["ore"] {
		t.Errorf("Tyranite kind = %d, want ore", got)
	}
}

func TestATypeWithNoReprocessingSkillOutsideGasIsLeftOut(t *testing.T) {
	data := generatedFixture()
	for _, id := range []string{"49787", "34", "77777"} {
		if _, held := data.Items[id]; held {
			t.Errorf("type %s should not be reprocessable", id)
		}
	}
}

func TestErraticOreGivesOneOfSeveralMineralsAtRandom(t *testing.T) {
	prismaticite := mustItem(t, generatedFixture(), "90041")
	if prismaticite.ItemType != ItemTypesForReprocessing["erratic"] {
		t.Fatalf("kind = %d, want erratic", prismaticite.ItemType)
	}
	if got := prismaticite.RandomizedMaterials["34"]; got != (QuantityRange{QuantityMin: 368000, QuantityMax: 496800}) {
		t.Errorf("Tritanium range = %+v", got)
	}
	b, err := jsoncodec.Marshal(prismaticite)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"materials":{}`) {
		t.Errorf("erratic ore must state it gives no fixed materials: %s", b)
	}
	if !strings.Contains(string(b), `"11399":{"quantityMin":312,"quantityMax":624}`) {
		t.Errorf("Morphite range missing from %s", b)
	}
}

func TestAnUnrefinedMineralGivesOneMineralInAVaryingAmount(t *testing.T) {
	morphite := mustItem(t, generatedFixture(), "90298")
	if morphite.ItemType != ItemTypesForReprocessing["unrefinedMineral"] {
		t.Fatalf("kind = %d, want unrefined mineral", morphite.ItemType)
	}
	if got := morphite.RandomizedMaterials["11399"]; got != (QuantityRange{QuantityMin: 93, QuantityMax: 187}) {
		t.Errorf("Morphite range = %+v", got)
	}
}

func TestOreWithFixedMaterialsWritesNoRandomizedMaterials(t *testing.T) {
	b, err := jsoncodec.Marshal(mustItem(t, generatedFixture(), "1230"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "randomizedMaterials") {
		t.Errorf("Veldspar wrote random outputs: %s", b)
	}
}

const spaReprocessingKindsPath = "../../../../../../frontend/src/Context/defaultValues.jsx"

var spaReprocessingKindsBlock = regexp.MustCompile(`(?s)export const reprocessingItemTypes = \{(.*?)\};`)
var spaReprocessingKindEntry = regexp.MustCompile(`(\w+):\s*(\d+)`)

func TestSPAAndServerAgreeOnTheReprocessingKinds(t *testing.T) {
	source, err := os.ReadFile(spaReprocessingKindsPath)
	if err != nil {
		t.Fatalf("reading the SPA kinds: %v", err)
	}
	block := spaReprocessingKindsBlock.FindSubmatch(source)
	if block == nil {
		t.Fatal("reprocessingItemTypes not found where this test looks for it")
	}
	spa := make(map[string]int)
	for _, entry := range spaReprocessingKindEntry.FindAllSubmatch(block[1], -1) {
		value, _ := strconv.Atoi(string(entry[2]))
		spa[string(entry[1])] = value
	}
	if len(spa) != len(ItemTypesForReprocessing) {
		t.Errorf("the SPA names %v; the server names %v", spa, ItemTypesForReprocessing)
	}
	for name, value := range ItemTypesForReprocessing {
		if spa[name] != value {
			t.Errorf("%s is %d on the server and %d in the SPA", name, value, spa[name])
		}
	}
}
