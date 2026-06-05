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
		if item.ExcludeFromRecipeList {
			continue
		}
		hasManufacturingMaterials := false
		if item.Activities != nil {
			if m, ok := item.Activities.ActivityMap("manufacturing"); ok {
				_, hasManufacturingMaterials = m["materials"]
			}
		}
		hasReactionActivities := false
		if item.Activities != nil && item.Activities.Reaction != nil {
			hasReactionActivities = true
		}
		hasInvention := item.Activities != nil && item.Activities.HasInventionSources()
		if (hasManufacturingMaterials || hasReactionActivities || hasInvention) && !excludedMarketGroupIDs[item.MarketGroupID] && !excludedMetaGroups[item.MetaGroupID] {
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
		updateInventionMaterials(item, typeIDMap)
	}
}

func updateMaterials(item *EVEType, activityType string, typeIDMap map[string]*EVEType) {
	if item.Activities == nil {
		return
	}
	activity, ok := item.Activities.ActivityMap(activityType)
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
		typeID, ok := parseSDETypeID(material["typeID"])
		if !ok {
			continue
		}
		matchedType, exists := typeIDMap[fmt.Sprintf("%d", typeID)]
		if !exists {
			continue
		}
		material["name"] = matchedType.Name
		material["jobType"] = matchedType.JobType
		material["volume"] = matchedType.Volume
	}
}

func updateInventionMaterials(item *EVEType, typeIDMap map[string]*EVEType) {
	if item.Activities == nil || item.Activities.Invention == nil {
		return
	}
	for srcKey, src := range item.Activities.Invention {
		mats := src.Materials
		for i := range mats {
			matchedType, exists := typeIDMap[fmt.Sprintf("%.0f", mats[i].TypeID)]
			if !exists {
				continue
			}
			mats[i].Name = matchedType.Name
			mats[i].JobType = matchedType.JobType
			mats[i].Volume = matchedType.Volume
		}
		src.Materials = mats
		item.Activities.Invention[srcKey] = src
	}
}
