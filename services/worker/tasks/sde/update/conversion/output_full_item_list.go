package conversion

import (
	"fmt"
	"regexp"
	"strconv"
)

var (
	skinRegex     = regexp.MustCompile(`(?i)skin`)
	reactionRegex = regexp.MustCompile(`(?i)reaction `)
)

func GenerateFullItemListOutput(combinedItemMap map[string]*EVEType, marketGroupsMap map[string]interface{}) map[string]*FullItem {
	fullItemList := make(map[string]*FullItem)
	for key, value := range combinedItemMap {
		if !shouldRemoveItem(value, marketGroupsMap) {
			fullItemList[key] = &FullItem{TypeID: value.ItemID, Name: value.Name}
		}
	}
	return fullItemList
}

func shouldRemoveItem(item *EVEType, marketGroupsMap map[string]interface{}) bool {
	return item.MarketGroupID == 0 || skinRegex.MatchString(item.Name) || isBlueprintAndVolumeLessThanOne(item, marketGroupsMap) || reactionRegex.MatchString(item.Name)
}

func isBlueprintAndVolumeLessThanOne(item *EVEType, marketGroupsMap map[string]interface{}) bool {
	parentGroupIDsToIgnore := map[int]bool{2: true}
	parentGroupIDStr := findParentGroupFromMarketGroup(item, marketGroupsMap)
	if parentGroupIDStr == "" {
		return false
	}
	parentGroupID, err := strconv.Atoi(parentGroupIDStr)
	if err != nil {
		return false
	}
	return parentGroupIDsToIgnore[parentGroupID]
}

func findParentGroupFromMarketGroup(item *EVEType, marketGroupsMap map[string]interface{}) string {
	if item.MarketSectionID == 0 {
		return ""
	}
	keyToFind := fmt.Sprintf("%d", item.MarketSectionID)
	matchedGroupData, exists := marketGroupsMap[keyToFind]
	if !exists {
		return ""
	}
	matchedGroup, ok := matchedGroupData.(map[string]interface{})
	if !ok {
		return ""
	}
	parentGroupID, ok := matchedGroup["parentGroupID"].(float64)
	if !ok || parentGroupID == 0 {
		return ""
	}
	parentKey := fmt.Sprintf("%.0f", parentGroupID)
	if _, parentExists := marketGroupsMap[parentKey]; !parentExists {
		return ""
	}
	return parentKey
}
