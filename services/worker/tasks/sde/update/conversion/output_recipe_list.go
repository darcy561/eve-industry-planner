package conversion

import (
	"fmt"
	"sort"
)

func GenerateRecipeListOutput(combinedItemMap map[string]*EVEType) []*EVEType {
	excludedMetaGroups := map[int]bool{5: true, 19: true}
	excludedMarketGroupIDs := map[int]bool{
		316: true, 404: true, 450: true, 451: true, 452: true, 453: true, 454: true, 455: true, 456: true, 457: true,
		458: true, 459: true, 460: true, 461: true, 462: true, 465: true, 467: true, 468: true, 469: true,
	}
	blueprintList := make([]*EVEType, 0, len(combinedItemMap)/4)
	for _, item := range combinedItemMap {
		hasManufacturingMaterials := false
		if item.Activities != nil {
			if m, ok := item.Activities["manufacturing"].(map[string]interface{}); ok {
				_, hasManufacturingMaterials = m["materials"]
			}
		}
		hasReactionActivities := false
		if item.Activities != nil {
			_, hasReactionActivities = item.Activities["reaction"]
		}
		if (hasManufacturingMaterials || hasReactionActivities) && !excludedMarketGroupIDs[item.MarketGroupID] && !excludedMetaGroups[item.MetaGroupID] {
			blueprintList = append(blueprintList, item)
		}
	}
	updateBlueprintMaterials(blueprintList, combinedItemMap)
	sort.Slice(blueprintList, func(i, j int) bool { return blueprintList[i].ItemID < blueprintList[j].ItemID })
	return blueprintList
}

func updateBlueprintMaterials(blueprintList []*EVEType, typeIDMap map[string]*EVEType) {
	for _, item := range blueprintList {
		if item.JobType == ManufacturingID {
			updateMaterials(item, "manufacturing", typeIDMap)
		}
		if item.JobType == ReactionID {
			updateMaterials(item, "reaction", typeIDMap)
		}
	}
}

func updateMaterials(item *EVEType, activityType string, typeIDMap map[string]*EVEType) {
	if item.Activities == nil {
		return
	}
	activity, ok := item.Activities[activityType].(map[string]interface{})
	if !ok {
		return
	}
	materials, ok := activity["materials"].([]interface{})
	if !ok {
		return
	}
	for _, matI := range materials {
		material, ok := matI.(map[string]interface{})
		if !ok {
			continue
		}
		typeID, ok := material["typeID"].(float64)
		if !ok {
			continue
		}
		matchedType, exists := typeIDMap[fmt.Sprintf("%.0f", typeID)]
		if !exists {
			continue
		}
		material["name"] = matchedType.Name
		material["jobType"] = matchedType.JobType
		material["volume"] = matchedType.Volume
	}
}
