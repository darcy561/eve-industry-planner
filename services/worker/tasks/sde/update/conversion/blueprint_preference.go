package conversion

// isPublishedBlueprintFormula is true when the SDE types row for blueprintTypeID is published (in-game).
func isPublishedBlueprintFormula(blueprint map[string]interface{}, typesData map[string]interface{}) bool {
	return isPublishedInGameType(blueprintTypeIDKey(blueprint), typesData)
}

// isPublishedInGameType is true when types.jsonl lists the type as published.
func isPublishedInGameType(typeIDKey string, typesData map[string]interface{}) bool {
	if typeIDKey == "" || typesData == nil {
		return false
	}
	raw, ok := typesData[typeIDKey].(map[string]interface{})
	if !ok {
		return false
	}
	published, ok := raw["published"].(bool)
	return ok && published
}

// preferBlueprintRow reports whether candidate should replace existing when both published rows
// map to the same product type ID (rare duplicate products in SDE).
func preferBlueprintRow(existing, candidate map[string]interface{}, _ map[string]interface{}) bool {
	if existing == nil {
		return true
	}
	if candidate == nil {
		return false
	}

	existingQty, existingOK := firstActivityProductQuantity(existing)
	candidateQty, candidateOK := firstActivityProductQuantity(candidate)
	if candidateOK && existingOK && candidateQty != existingQty {
		return candidateQty > existingQty
	}
	if candidateOK != existingOK {
		return candidateOK
	}

	existingID, _ := parseSDETypeID(existing["blueprintTypeID"])
	candidateID, _ := parseSDETypeID(candidate["blueprintTypeID"])
	return candidateID > existingID
}

func assignBlueprintKey(out map[string]interface{}, key string, blueprint map[string]interface{}, typesData map[string]interface{}) {
	if key == "" || blueprint == nil || !isPublishedBlueprintFormula(blueprint, typesData) {
		return
	}
	if existing, ok := out[key].(map[string]interface{}); ok {
		if !preferBlueprintRow(existing, blueprint, typesData) {
			return
		}
	}
	out[key] = blueprint
}

func firstActivityProductQuantity(blueprint map[string]interface{}) (int, bool) {
	activities, ok := blueprint["activities"].(map[string]interface{})
	if !ok {
		return 0, false
	}
	for _, key := range []string{"manufacturing", "reaction"} {
		activity, ok := activities[key].(map[string]interface{})
		if !ok {
			continue
		}
		products, ok := activity["products"].([]interface{})
		if !ok || len(products) == 0 {
			continue
		}
		product, ok := products[0].(map[string]interface{})
		if !ok {
			continue
		}
		qty, ok := parseSDETypeID(product["quantity"])
		if ok {
			return qty, true
		}
	}
	return 0, false
}
