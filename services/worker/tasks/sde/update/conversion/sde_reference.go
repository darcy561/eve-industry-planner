package conversion

import "strconv"

// isProductIndexKey is true when key is the primary output type ID for manufacturing or reaction on this blueprint row.
func isProductIndexKey(key string, blueprint map[string]interface{}) bool {
	activities, ok := blueprint["activities"].(map[string]interface{})
	if !ok {
		return false
	}
	for _, actKey := range []string{"manufacturing", "reaction"} {
		activity, ok := activities[actKey].(map[string]interface{})
		if !ok {
			continue
		}
		if extractTypeID(activity) == key {
			return true
		}
	}
	return false
}

// jobTypeForBlueprintRow returns ManufacturingID or ReactionID when the row has that activity with products.
func jobTypeForBlueprintRow(blueprint map[string]interface{}) int {
	activities, ok := blueprint["activities"].(map[string]interface{})
	if !ok {
		return BaseMaterialID
	}
	if m, ok := activities["manufacturing"].(map[string]interface{}); ok {
		if products, ok := m["products"].([]interface{}); ok && len(products) > 0 {
			return ManufacturingID
		}
	}
	if r, ok := activities["reaction"].(map[string]interface{}); ok {
		if products, ok := r["products"].([]interface{}); ok && len(products) > 0 {
			return ReactionID
		}
	}
	return BaseMaterialID
}

// activityProductQuantity returns the first product quantity for the job type's primary activity.
func activityProductQuantity(item *EVEType) (int, bool) {
	if item == nil || item.Activities == nil {
		return 0, false
	}
	switch item.JobType {
	case ManufacturingID:
		return activityQuantityFromMap(item.Activities.Manufacturing)
	case ReactionID:
		return activityQuantityFromMap(item.Activities.Reaction)
	default:
		return 0, false
	}
}

func activityQuantityFromMap(activity map[string]interface{}) (int, bool) {
	if activity == nil {
		return 0, false
	}
	products, ok := activity["products"].([]interface{})
	if !ok || len(products) == 0 {
		return 0, false
	}
	product, ok := products[0].(map[string]interface{})
	if !ok {
		return 0, false
	}
	return parseSDETypeID(product["quantity"])
}

// blueprintProductQuantity reads quantity from a raw SDE blueprint row for the activity matching jobType.
func blueprintProductQuantity(blueprint map[string]interface{}, jobType int) (int, bool) {
	activities, ok := blueprint["activities"].(map[string]interface{})
	if !ok {
		return 0, false
	}
	var actKey string
	switch jobType {
	case ManufacturingID:
		actKey = "manufacturing"
	case ReactionID:
		actKey = "reaction"
	default:
		return 0, false
	}
	activity, ok := activities[actKey].(map[string]interface{})
	if !ok {
		return 0, false
	}
	return activityQuantityFromMap(activity)
}

// discoverAnchorProducts returns item IDs useful for spot-check logs: reaction collision, reaction, manufacturing.
func discoverAnchorProducts(blueprints, types map[string]interface{}) (collisionProduct, reactionProduct, manufacturingProduct int) {
	unpubByProduct := make(map[string][]map[string]interface{})
	publishedReaction := make(map[string]map[string]interface{})
	publishedMfg := make(map[string]map[string]interface{})

	for _, raw := range blueprints {
		bp, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		activities, ok := bp["activities"].(map[string]interface{})
		if !ok {
			continue
		}
		if r, ok := activities["reaction"].(map[string]interface{}); ok {
			prodKey := extractTypeID(r)
			if prodKey == "" {
				continue
			}
			if isPublishedBlueprintFormula(bp, types) {
				if prev, exists := publishedReaction[prodKey]; !exists || preferBlueprintRow(prev, bp, types) {
					publishedReaction[prodKey] = bp
				}
			} else {
				unpubByProduct[prodKey] = append(unpubByProduct[prodKey], bp)
			}
		}
		if m, ok := activities["manufacturing"].(map[string]interface{}); ok {
			prodKey := extractTypeID(m)
			if prodKey == "" || !isPublishedBlueprintFormula(bp, types) {
				continue
			}
			if prev, exists := publishedMfg[prodKey]; !exists || preferBlueprintRow(prev, bp, types) {
				publishedMfg[prodKey] = bp
			}
		}
	}

	for prodKey := range unpubByProduct {
		if publishedReaction[prodKey] != nil {
			collisionProduct, _ = strconv.Atoi(prodKey)
			break
		}
	}
	collisionKey := strconv.Itoa(collisionProduct)
	for prodKey := range publishedReaction {
		if collisionProduct > 0 && prodKey == collisionKey {
			continue
		}
		reactionProduct, _ = strconv.Atoi(prodKey)
		break
	}
	for prodKey := range publishedMfg {
		manufacturingProduct, _ = strconv.Atoi(prodKey)
		break
	}
	return collisionProduct, reactionProduct, manufacturingProduct
}
