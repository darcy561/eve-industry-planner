package conversion

import (
	"fmt"
	"maps"
	"strconv"
)

// ApplyInventionToOutputItems walks every blueprint row and copies activities.invention onto each
// product type listed in invention.products (T2/T3 BPC outputs). Keys under activities.invention
// are source blueprint type IDs (Option B). T1 manufacture rows never receive invention here.
func ApplyInventionToOutputItems(fullBlueprintMap map[string]any, combinedItemMap map[string]*EVEType, typesData map[string]any) {
	for _, raw := range fullBlueprintMap {
		bp, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if !isPublishedBlueprintFormula(bp, typesData) {
			continue
		}
		activities, ok := bp["activities"].(map[string]any)
		if !ok {
			continue
		}
		inv, ok := activities["invention"].(map[string]any)
		if !ok {
			continue
		}
		srcKey := blueprintTypeIDKey(bp)
		if srcKey == "" {
			continue
		}
		products, ok := inv["products"].([]any)
		if !ok {
			continue
		}
		for _, p := range products {
			prod, ok := p.(map[string]any)
			if !ok {
				continue
			}
			tid, ok := prod["typeID"].(float64)
			if !ok {
				continue
			}
			outKey := fmt.Sprintf("%.0f", tid)
			item := combinedItemMap[outKey]
			if item == nil {
				continue
			}
			source := inventionSourceForProduct(inv, tid)
			if item.Activities == nil {
				item.Activities = &RecipeActivities{}
			}
			if item.Activities.Invention == nil {
				item.Activities.Invention = make(map[string]InventionSource)
			}
			item.Activities.Invention[srcKey] = source
		}
	}
}

func inventionSourceForProduct(inv map[string]any, productTypeID float64) InventionSource {
	base := inventionSourceFromSDEMap(inv)
	want := int64(productTypeID)
	filtered := make([]InventionProduct, 0, 1)
	for _, p := range base.Products {
		if int64(p.TypeID) == want {
			filtered = append(filtered, p)
		}
	}
	base.Products = filtered
	return base
}

// BuildManufacturedProductByBlueprintTypeID maps blueprint paper type ID → first manufacturing
// product type ID from the same SDE blueprint row (hull, ammo run, etc.).
func BuildManufacturedProductByBlueprintTypeID(fullBlueprintMap map[string]any, typesData map[string]any) map[int]int {
	out := make(map[int]int)
	for _, raw := range fullBlueprintMap {
		bp, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if !isPublishedBlueprintFormula(bp, typesData) {
			continue
		}
		bpIDf, ok := bp["blueprintTypeID"].(float64)
		if !ok {
			continue
		}
		bpID := int(bpIDf)
		activities, ok := bp["activities"].(map[string]any)
		if !ok {
			continue
		}
		mfg, ok := activities["manufacturing"].(map[string]any)
		if !ok {
			continue
		}
		prods, ok := mfg["products"].([]any)
		if !ok || len(prods) == 0 {
			continue
		}
		first, ok := prods[0].(map[string]any)
		if !ok {
			continue
		}
		tid, ok := first["typeID"].(float64)
		if !ok {
			continue
		}
		out[bpID] = int(tid)
	}
	return out
}

// MergeInventionOntManufacturedProduct moves activities.invention from each blueprint **item**
// (B = blueprintTypeID) onto the **manufactured product** (P = manufacturing.products[0]) from
// the same row — e.g. Confessor Blueprint → Confessor hull — so recipeList has one row per ship.
func MergeInventionOntManufacturedProduct(combinedItemMap map[string]*EVEType, bpToProduct map[int]int) {
	for bpID, prodID := range bpToProduct {
		bpKey := strconv.Itoa(bpID)
		prodKey := strconv.Itoa(prodID)
		bpItem := combinedItemMap[bpKey]
		if bpItem == nil || bpItem.Activities == nil || !bpItem.Activities.HasInventionSources() {
			continue
		}
		prodItem := combinedItemMap[prodKey]
		if prodItem == nil {
			continue
		}
		if prodItem.Activities == nil {
			prodItem.Activities = &RecipeActivities{}
		}
		if prodItem.Activities.Invention == nil {
			prodItem.Activities.Invention = make(map[string]InventionSource)
		}
		maps.Copy(prodItem.Activities.Invention, bpItem.Activities.Invention)
		bpItem.Activities.Invention = nil
		if recipeActivitiesEmpty(bpItem.Activities) {
			bpItem.Activities = nil
		}
		bpItem.ExcludeFromRecipeList = true
	}
}

func recipeActivitiesEmpty(a *RecipeActivities) bool {
	if a == nil {
		return true
	}
	return a.Manufacturing == nil && a.Reaction == nil && a.Copying == nil &&
		a.ResearchMaterial == nil && a.ResearchTime == nil && len(a.Invention) == 0
}
