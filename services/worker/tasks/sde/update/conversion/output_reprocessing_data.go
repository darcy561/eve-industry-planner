package conversion

import (
	"strconv"
)

// ItemTypesForReprocessing names each kind of reprocessable item by the number the SPA reads it as;
// the kind decides which yield formula, structure bonus and rigs apply.
var ItemTypesForReprocessing = map[string]int{
	"ore":              0,
	"moonOre":          1,
	"ice":              2,
	"gas":              3,
	"scrap":            4,
	"unrefinedMineral": 5,
	"erratic":          6,
}

// reprocessingRootMarketGroups are the top-level market groups whose branches hold each kind:
// Standard Ores, Moon Ores, Ice Ores and Gas Clouds Materials.
var reprocessingRootMarketGroups = map[int]int{
	54:   ItemTypesForReprocessing["ore"],
	2395: ItemTypesForReprocessing["moonOre"],
	1855: ItemTypesForReprocessing["ice"],
	1032: ItemTypesForReprocessing["gas"],
}

const (
	reprocessingSkillTypeAttribute  = 790
	gasDecompressionEfficiencySkill = 62452
)

// GenerateReprocessingDataOutput builds the reprocessing static file from the SDE's type materials,
// the published types, the market groups and each type's reprocessing skill attribute.
func GenerateReprocessingDataOutput(typeMaterials map[string]any, typeIDMap map[string]*EVEType, marketGroups map[string]any, typeDogma map[string]any) *ReprocessingData {
	items := make(map[string]*ReprocessingItem)
	for key, eveType := range typeIDMap {
		row, ok := typeMaterials[key].(map[string]any)
		if !ok || eveType.MarketSectionID == 0 {
			continue
		}
		dogma, _ := typeDogma[key].(map[string]any)
		skill, hasSkill := dogmaAttributeIfHeld(dogma, reprocessingSkillTypeAttribute)
		root, hasRoot := reprocessingRootOf(eveType.MarketSectionID, marketGroups)
		isGas := hasRoot && root == ItemTypesForReprocessing["gas"]
		if !hasSkill && !isGas {
			continue
		}

		item := &ReprocessingItem{
			ID:                  key,
			Name:                eveType.Name,
			Materials:           materialsOf(row["materials"]),
			RandomizedMaterials: randomizedMaterialsOf(row["randomizedMaterials"]),
			BatchSize:           eveType.PortionSize,
			ReprocessingSkill:   int(skill),
			Volume:              eveType.Volume,
		}
		if isGas {
			item.ReprocessingSkill = gasDecompressionEfficiencySkill
		}
		if len(item.Materials) == 0 && len(item.RandomizedMaterials) == 0 {
			continue
		}
		item.ItemType = reprocessingKindOf(item, root, hasRoot)
		items[key] = item
	}
	return &ReprocessingData{
		Items:           items,
		MaterialVolumes: materialVolumesOf(items, typeIDMap),
	}
}

// reprocessingKindOf names an item's kind: one random mineral of several is erratic ore, one mineral
// in a varying amount is an unrefined mineral, and anything else takes its market branch's kind.
func reprocessingKindOf(item *ReprocessingItem, root int, hasRoot bool) int {
	switch {
	case len(item.RandomizedMaterials) > 1:
		return ItemTypesForReprocessing["erratic"]
	case len(item.RandomizedMaterials) == 1:
		return ItemTypesForReprocessing["unrefinedMineral"]
	case hasRoot:
		return root
	default:
		return ItemTypesForReprocessing["ore"]
	}
}

// reprocessingRootOf walks a market group's ancestry to the first of the reprocessing root groups,
// answering its kind.
func reprocessingRootOf(marketGroupID int, marketGroups map[string]any) (int, bool) {
	seen := make(map[int]bool)
	for id := marketGroupID; id != 0 && !seen[id]; {
		if kind, ok := reprocessingRootMarketGroups[id]; ok {
			return kind, true
		}
		seen[id] = true
		group, ok := marketGroups[strconv.Itoa(id)].(map[string]any)
		if !ok {
			return 0, false
		}
		parent, _ := float64FromJSON(group["parentGroupID"])
		id = int(parent)
	}
	return 0, false
}

// materialsOf reads a fixed materials list as quantities keyed by material type id.
func materialsOf(raw any) map[string]int {
	materials := make(map[string]int)
	for _, entry := range sliceFromJSON(raw) {
		material, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		id, ok := float64FromJSON(material["materialTypeID"])
		if !ok {
			continue
		}
		quantity, _ := float64FromJSON(material["quantity"])
		materials[strconv.Itoa(int(id))] = int(quantity)
	}
	return materials
}

// randomizedMaterialsOf reads a randomised materials list as each mineral's range per batch, nil when
// the type has none.
func randomizedMaterialsOf(raw any) map[string]QuantityRange {
	entries := sliceFromJSON(raw)
	if len(entries) == 0 {
		return nil
	}
	ranges := make(map[string]QuantityRange, len(entries))
	for _, entry := range entries {
		material, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		id, ok := float64FromJSON(material["materialTypeID"])
		if !ok {
			continue
		}
		low, _ := float64FromJSON(material["quantityMin"])
		high, _ := float64FromJSON(material["quantityMax"])
		ranges[strconv.Itoa(int(id))] = QuantityRange{QuantityMin: int(low), QuantityMax: int(high)}
	}
	return ranges
}

// materialVolumesOf states once the volume of every material the items give, fixed or random,
// leaving out any type the SDE gives no volume.
func materialVolumesOf(items map[string]*ReprocessingItem, typeIDMap map[string]*EVEType) map[string]float64 {
	volumes := make(map[string]float64)
	add := func(materialID string) {
		if material, ok := typeIDMap[materialID]; ok && material.Volume > 0 {
			volumes[materialID] = material.Volume
		}
	}
	for _, item := range items {
		for materialID := range item.Materials {
			add(materialID)
		}
		for materialID := range item.RandomizedMaterials {
			add(materialID)
		}
	}
	return volumes
}
