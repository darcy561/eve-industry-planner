package conversion

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func ConvertBlueprintDataToTypeIDMap(blueprintData map[string]any, typesData map[string]any) map[string]any {
	out := make(map[string]any)
	for _, value := range blueprintData {
		blueprint, ok := value.(map[string]any)
		if !ok {
			continue
		}
		if !isPublishedBlueprintFormula(blueprint, typesData) {
			continue
		}
		activities, ok := blueprint["activities"].(map[string]any)
		if !ok {
			continue
		}
		if m, ok := activities["manufacturing"].(map[string]any); ok {
			if typeID := extractTypeID(m); typeID != "" {
				assignBlueprintKey(out, typeID, blueprint, typesData)
			}
		}
		if r, ok := activities["reaction"].(map[string]any); ok {
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

func extractTypeID(activity map[string]any) string {
	prodID, ok := firstProductTypeID(activity)
	if !ok {
		return ""
	}
	return fmt.Sprintf("%d", prodID)
}

func BuildCombinedItemMap(typesData map[string]any, blueprintData map[string]any) map[string]*EVEType {
	out := make(map[string]*EVEType, len(typesData))
	for key, value := range typesData {
		itemData, ok := value.(map[string]any)
		if !ok {
			continue
		}
		if published, ok := itemData["published"].(bool); ok && !published {
			continue
		}
		if name, ok := itemData["name"].(map[string]any); ok {
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
			if blueprint, ok := blueprintMatch.(map[string]any); ok {
				if activities, ok := blueprint["activities"].(map[string]any); ok {
					if manufacturing, ok := activities["manufacturing"].(map[string]any); ok {
						if products, ok := manufacturing["products"].([]any); ok && len(products) > 0 {
							newItem.JobType = ManufacturingID
							mergeBlueprintData(newItem, blueprint)
						}
					}
					if reaction, ok := activities["reaction"].(map[string]any); ok {
						if products, ok := reaction["products"].([]any); ok && len(products) > 0 {
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

func createEVETypeFromData(itemData map[string]any) *EVEType {
	item := &EVEType{}
	if key, ok := itemData["_key"].(float64); ok {
		item.Key = int(key)
		item.ItemID = int(key)
	}
	if nameObj, ok := itemData["name"].(map[string]any); ok {
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

func mergeBlueprintData(newItem *EVEType, blueprintData map[string]any) {
	if activities, ok := blueprintData["activities"].(map[string]any); ok {
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
func recipeActivitiesFromSDE(activities map[string]any, blueprintRow map[string]any) *RecipeActivities {
	out := &RecipeActivities{}
	if m, ok := activities["manufacturing"].(map[string]any); ok {
		out.Manufacturing = m
	}
	if m, ok := activities["reaction"].(map[string]any); ok {
		out.Reaction = m
	}
	if m, ok := activities["copying"].(map[string]any); ok {
		out.Copying = m
	}
	if m, ok := activities["research_material"].(map[string]any); ok {
		out.ResearchMaterial = m
	}
	if m, ok := activities["research_time"].(map[string]any); ok {
		out.ResearchTime = m
	}

	// Invention is attached only to invention *output* types (T2/T3 BPCs, etc.) via ApplyInventionToOutputItems, not on T1 manufacture rows.
	return out
}

func blueprintTypeIDKey(blueprintRow map[string]any) string {
	return formatSDETypeIDKey(blueprintRow["blueprintTypeID"])
}

func inventionSourceFromSDEMap(m map[string]any) InventionSource {
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
