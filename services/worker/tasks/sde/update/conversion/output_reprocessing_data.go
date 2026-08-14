package conversion

import (
	"fmt"
	"strconv"
)

var marketGroupsToSkills = map[int]int{
	452: 60379, 453: 60379, 457: 60378, 458: 60377, 460: 60377,
	512: 60380, 514: 60380, 515: 60377, 516: 60377, 517: 60380,
	518: 60377, 519: 60377, 521: 60379, 522: 60379, 523: 60378,
	525: 60379, 526: 60378, 527: 60378, 528: 60378, 529: 60378,
	530: 12189, 1855: 18025, 2538: 60381, 2539: 60381, 2540: 60381,
	3487: 60377, 3488: 60378, 3489: 60380, 3490: 60380,
	3636: 60379, 3637: 60378, 3638: 60380, 3639: 60380, 3640: 60378,
	2396: 46152, 2397: 46153, 2398: 46154, 2400: 46155, 2401: 46156,
	1032: 62452,
}

var (
	parentMarketGroupsToInclude = map[string]bool{
		"54": true, "1855": true, "2395": true, "1032": true,
	}
	ItemTypesForReprocessing = map[string]int{
		"ore":     0,
		"moonOre": 1,
		"ice":     2,
		"gas":     3,
		"scrap":   4,
	}

	marketGroupsToItemTypes = map[string]int{
		"54":   ItemTypesForReprocessing["ore"],
		"2395": ItemTypesForReprocessing["moonOre"],
		"1855": ItemTypesForReprocessing["ice"],
		"1032": ItemTypesForReprocessing["gas"],
	}
)

func GenerateReprocessingDataOutput(reprocessingMap map[string]any, typeIDMap map[string]*EVEType, marketGroupsMap map[string]any) map[string]*ReprocessingItem {
	reprocessingObjects := make(map[string]*ReprocessingItem)
	for key, value := range typeIDMap {
		reprocessingItemData, exists := reprocessingMap[key]
		if !exists {
			continue
		}
		parentGroup := findParentGroupFromMarketGroup(value, marketGroupsMap)
		if parentGroup == "" {
			continue
		}
		marketSectionStr := fmt.Sprintf("%d", value.MarketSectionID)
		if !parentMarketGroupsToInclude[parentGroup] && !parentMarketGroupsToInclude[marketSectionStr] {
			continue
		}
		newItem := createReprocessingItem(key, reprocessingItemData, value, marketGroupsMap)
		reprocessingObjects[newItem.ID] = newItem
	}
	return reprocessingObjects
}

func createReprocessingItem(key string, reprocessingData any, mainItem *EVEType, marketGroupsMap map[string]any) *ReprocessingItem {
	item := &ReprocessingItem{
		ID:        key,
		Name:      mainItem.Name,
		Materials: make(map[string]int),
		BatchSize: mainItem.PortionSize,
		ItemType:  assignReprocessingItemType(mainItem, marketGroupsMap),
	}
	parentGroupID := findParentGroupFromMarketGroup(mainItem, marketGroupsMap)
	if skill, exists := marketGroupsToSkills[mainItem.MarketSectionID]; exists {
		item.ReprocessingSkill = skill
	} else if parentGroupID != "" {
		if pg, err := strconv.Atoi(parentGroupID); err == nil {
			if skill, ok := marketGroupsToSkills[pg]; ok {
				item.ReprocessingSkill = skill
			} else {
				item.ReprocessingSkill = 12196
			}
		} else {
			item.ReprocessingSkill = 12196
		}
	} else {
		item.ReprocessingSkill = 12196
	}

	if reprocessingM, ok := reprocessingData.(map[string]any); ok {
		for _, value := range reprocessingM {
			materialArray, ok := value.([]any)
			if !ok {
				continue
			}
			for _, materialItem := range materialArray {
				material, ok := materialItem.(map[string]any)
				if !ok {
					continue
				}
				materialID, ok := material["materialTypeID"].(float64)
				if !ok {
					continue
				}
				qty := 0
				if q, ok := material["quantity"].(float64); ok {
					qty = int(q)
				}
				item.Materials[fmt.Sprintf("%.0f", materialID)] = qty
			}
		}
	}
	return item
}

func assignReprocessingItemType(item *EVEType, marketGroupsMap map[string]any) int {
	if parentGroupID := findParentGroupFromMarketGroup(item, marketGroupsMap); parentGroupID != "" {
		if itemType, exists := marketGroupsToItemTypes[parentGroupID]; exists {
			return itemType
		}
	}

	marketSectionStr := fmt.Sprintf("%d", item.MarketSectionID)
	if itemType, exists := marketGroupsToItemTypes[marketSectionStr]; exists {
		return itemType
	}
	return ItemTypesForReprocessing["scrap"]
}
