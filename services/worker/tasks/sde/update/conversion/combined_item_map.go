package conversion

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func ConvertBlueprintDataToTypeIDMap(blueprintData map[string]interface{}, typesData map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{})
	for _, value := range blueprintData {
		blueprint, ok := value.(map[string]interface{})
		if !ok {
			continue
		}
		if !isPublishedBlueprintFormula(blueprint, typesData) {
			continue
		}
		activities, ok := blueprint["activities"].(map[string]interface{})
		if !ok {
			continue
		}
		if m, ok := activities["manufacturing"].(map[string]interface{}); ok {
			if typeID := extractTypeID(m); typeID != "" {
				assignBlueprintKey(out, typeID, blueprint, typesData)
			}
		}
		if r, ok := activities["reaction"].(map[string]interface{}); ok {
			if typeID := extractTypeID(r); typeID != "" {
				assignBlueprintKey(out, typeID, blueprint, typesData)
			}
			// Also index by formula (BPC) type ID so published formula rows can be merged onto the product.
			if bpKey := blueprintTypeIDKey(blueprint); bpKey != "" {
				if productKey := extractTypeID(r); productKey == "" || bpKey != productKey {
					assignBlueprintKey(out, bpKey, blueprint, typesData)
				}
			}
		}
	}
	return out
}

func extractTypeID(activity map[string]interface{}) string {
	prodID, ok := firstProductTypeID(activity)
	if !ok {
		return ""
	}
	return fmt.Sprintf("%d", prodID)
}

func BuildCombinedItemMap(typesData map[string]interface{}, blueprintData map[string]interface{}) map[string]*EVEType {
	out := make(map[string]*EVEType, len(typesData))
	for key, value := range typesData {
		itemData, ok := value.(map[string]interface{})
		if !ok {
			continue
		}
		if published, ok := itemData["published"].(bool); ok && !published {
			continue
		}
		if name, ok := itemData["name"].(map[string]interface{}); ok {
			if enName, ok := name["en"].(string); ok {
				if strings.Contains(enName, "expired") || strings.Contains(enName, "Expired") {
					continue
				}
			}
		}

		newItem := createEVETypeFromData(itemData)
		newItem.JobType = BaseMaterialID

		keyStr := strconv.Itoa(newItem.Key)
		if blueprintMatch, exists := blueprintData[keyStr]; exists {
			if blueprint, ok := blueprintMatch.(map[string]interface{}); ok {
				if activities, ok := blueprint["activities"].(map[string]interface{}); ok {
					if manufacturing, ok := activities["manufacturing"].(map[string]interface{}); ok {
						if products, ok := manufacturing["products"].([]interface{}); ok && len(products) > 0 {
							newItem.JobType = ManufacturingID
							mergeBlueprintData(newItem, blueprint)
						}
					}
					if reaction, ok := activities["reaction"].(map[string]interface{}); ok {
						if products, ok := reaction["products"].([]interface{}); ok && len(products) > 0 {
							newItem.JobType = ReactionID
							mergeBlueprintData(newItem, blueprint)
						}
					}
				}
			}
		}
		out[key] = newItem
	}
	return out
}

func createEVETypeFromData(itemData map[string]interface{}) *EVEType {
	item := &EVEType{}
	if key, ok := itemData["_key"].(float64); ok {
		item.Key = int(key)
		item.ItemID = int(key)
	}
	if nameObj, ok := itemData["name"].(map[string]interface{}); ok {
		if enName, ok := nameObj["en"].(string); ok {
			item.Name = enName
		}
	}
	if marketGroupID, ok := itemData["marketGroupID"].(float64); ok {
		item.MarketSectionID = int(marketGroupID)
	}
	if groupID, ok := itemData["groupID"].(float64); ok {
		item.MarketGroupID = int(groupID)
	}
	if metaGroupID, ok := itemData["metaGroupID"].(float64); ok {
		item.MetaGroupID = int(metaGroupID)
	}
	if raceID, ok := itemData["raceID"].(float64); ok {
		item.RaceID = int(raceID)
	}
	if volume, ok := itemData["volume"].(float64); ok {
		item.Volume = volume
	}
	if basePrice, ok := itemData["basePrice"].(float64); ok {
		item.BasePrice = basePrice
	}
	if graphicID, ok := itemData["graphicID"].(float64); ok {
		item.GraphicID = int(graphicID)
	}
	if portionSize, ok := itemData["portionSize"].(float64); ok {
		item.PortionSize = int(portionSize)
	}
	return item
}

func mergeBlueprintData(newItem *EVEType, blueprintData map[string]interface{}) {
	if activities, ok := blueprintData["activities"].(map[string]interface{}); ok {
		newItem.Activities = recipeActivitiesFromSDE(activities, blueprintData)
	}
	if blueprintTypeID, ok := parseSDETypeID(blueprintData["blueprintTypeID"]); ok {
		newItem.BlueprintTypeID = blueprintTypeID
	}
	if maxProductionLimit, ok := parseSDETypeID(blueprintData["maxProductionLimit"]); ok {
		newItem.MaxProductionLimit = maxProductionLimit
	}
}

// recipeActivitiesFromSDE converts raw SDE activities onto RecipeActivities.
// SDE uses a single invention object per blueprint row; static output nests it under invention[sourceBlueprintTypeID] (Option B).
func recipeActivitiesFromSDE(activities map[string]interface{}, blueprintRow map[string]interface{}) *RecipeActivities {
	out := &RecipeActivities{}
	if m, ok := activities["manufacturing"].(map[string]interface{}); ok {
		out.Manufacturing = m
	}
	if m, ok := activities["reaction"].(map[string]interface{}); ok {
		out.Reaction = m
	}
	if m, ok := activities["copying"].(map[string]interface{}); ok {
		out.Copying = m
	}
	if m, ok := activities["research_material"].(map[string]interface{}); ok {
		out.ResearchMaterial = m
	}
	if m, ok := activities["research_time"].(map[string]interface{}); ok {
		out.ResearchTime = m
	}

	// Invention is attached only to invention *output* types (T2/T3 BPCs, etc.) via ApplyInventionToOutputItems, not on T1 manufacture rows.
	return out
}

func blueprintTypeIDKey(blueprintRow map[string]interface{}) string {
	return formatSDETypeIDKey(blueprintRow["blueprintTypeID"])
}

func inventionSourceFromSDEMap(m map[string]interface{}) InventionSource {
	b, err := json.Marshal(m)
	if err != nil {
		return InventionSource{}
	}
	var s InventionSource
	if err := json.Unmarshal(b, &s); err != nil {
		return InventionSource{}
	}
	return s
}
