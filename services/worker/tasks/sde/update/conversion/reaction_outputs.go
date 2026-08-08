package conversion

import (
	"strconv"
)

// BuildReactionProductByBlueprintTypeID maps reaction formula type ID → first reaction product type ID.
func BuildReactionProductByBlueprintTypeID(fullBlueprintMap map[string]any, typesData map[string]any) map[int]int {
	out := make(map[int]int)
	for _, raw := range fullBlueprintMap {
		bp, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if !isPublishedBlueprintFormula(bp, typesData) {
			continue
		}
		bpID, ok := parseSDETypeID(bp["blueprintTypeID"])
		if !ok {
			continue
		}
		activities, ok := bp["activities"].(map[string]any)
		if !ok {
			continue
		}
		reaction, ok := activities["reaction"].(map[string]any)
		if !ok {
			continue
		}
		prodID, ok := firstProductTypeID(reaction)
		if !ok {
			continue
		}
		out[bpID] = prodID
	}
	return out
}

// MergeReactionFormulaOntoProduct moves activities.reaction from each formula item (blueprintTypeID)
// onto the output product (reaction.products[0]) so recipeList and Mongo stay keyed by product itemID.
func MergeReactionFormulaOntoProduct(combinedItemMap map[string]*EVEType, bpToProduct map[int]int, typesData map[string]any) {
	for bpID, prodID := range bpToProduct {
		if bpID == prodID {
			continue
		}
		bpKey := strconv.Itoa(bpID)
		prodKey := strconv.Itoa(prodID)
		bpItem := combinedItemMap[bpKey]
		if bpItem == nil || bpItem.Activities == nil || bpItem.Activities.Reaction == nil {
			continue
		}
		prodItem := combinedItemMap[prodKey]
		if prodItem == nil {
			continue
		}
		if prodItem.Activities == nil {
			prodItem.Activities = &RecipeActivities{}
		}
		applyFormula := shouldApplyFormulaReactionToProduct(prodItem, bpItem, typesData)
		if applyFormula {
			prodItem.Activities.Reaction = bpItem.Activities.Reaction
			prodItem.BlueprintTypeID = bpID
		}
		prodItem.JobType = ReactionID
		if prodItem.BlueprintTypeID == 0 {
			prodItem.BlueprintTypeID = bpID
		}
		if prodItem.MaxProductionLimit == 0 && bpItem.MaxProductionLimit > 0 {
			prodItem.MaxProductionLimit = bpItem.MaxProductionLimit
		}
		bpItem.Activities.Reaction = nil
		if recipeActivitiesEmpty(bpItem.Activities) {
			bpItem.Activities = nil
		}
		bpItem.ExcludeFromRecipeList = true
	}
}

func shouldApplyFormulaReactionToProduct(prodItem, formulaItem *EVEType, typesData map[string]any) bool {
	if prodItem.Activities == nil || prodItem.Activities.Reaction == nil {
		return true
	}
	return preferBlueprintRow(blueprintRowFromEVEType(prodItem), blueprintRowFromEVEType(formulaItem), typesData)
}

func blueprintRowFromEVEType(item *EVEType) map[string]any {
	if item == nil {
		return nil
	}
	row := map[string]any{
		"blueprintTypeID": item.BlueprintTypeID,
	}
	if item.Activities == nil {
		return row
	}
	activities := map[string]any{}
	if item.Activities.Manufacturing != nil {
		activities["manufacturing"] = item.Activities.Manufacturing
	}
	if item.Activities.Reaction != nil {
		activities["reaction"] = item.Activities.Reaction
	}
	if len(activities) > 0 {
		row["activities"] = activities
	}
	return row
}

func firstProductTypeID(activity map[string]any) (int, bool) {
	products, ok := activity["products"].([]any)
	if !ok || len(products) == 0 {
		return 0, false
	}
	product, ok := products[0].(map[string]any)
	if !ok {
		return 0, false
	}
	return parseSDETypeID(product["typeID"])
}
