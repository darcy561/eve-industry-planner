package conversion

import (
	"fmt"
	"strconv"
	"strings"
)

func ConvertBlueprintDataToTypeIDMap(blueprintData map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{})
	for _, value := range blueprintData {
		blueprint, ok := value.(map[string]interface{})
		if !ok {
			continue
		}
		activities, ok := blueprint["activities"].(map[string]interface{})
		if !ok {
			continue
		}
		if m, ok := activities["manufacturing"].(map[string]interface{}); ok {
			if typeID := extractTypeID(m); typeID != "" {
				out[typeID] = value
			}
		}
		if r, ok := activities["reaction"].(map[string]interface{}); ok {
			if typeID := extractTypeID(r); typeID != "" {
				out[typeID] = value
			}
		}
	}
	return out
}

func extractTypeID(activity map[string]interface{}) string {
	products, ok := activity["products"].([]interface{})
	if !ok || len(products) == 0 {
		return ""
	}
	product, ok := products[0].(map[string]interface{})
	if !ok {
		return ""
	}
	typeID, ok := product["typeID"].(float64)
	if !ok {
		return ""
	}
	return fmt.Sprintf("%.0f", typeID)
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
		newItem.Activities = activities
	}
	if blueprintTypeID, ok := blueprintData["blueprintTypeID"].(float64); ok {
		newItem.BlueprintTypeID = int(blueprintTypeID)
	}
	if maxProductionLimit, ok := blueprintData["maxProductionLimit"].(float64); ok {
		newItem.MaxProductionLimit = int(maxProductionLimit)
	}
}
