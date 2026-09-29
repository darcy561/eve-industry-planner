package conversion

import "strconv"

// GenerateFullItemListOutput names every published type.
//
// The SPA reads this as one thing: the id-to-name map for whatever a player turns out to be
// holding, which is why it is not narrowed to what can be bought. A SKIN, an unpublished oddity and
// a relic with no market group all reach an asset list, and a type this file does not carry shows
// there as "Unknown Item - <id>". What can be built or searched for is the search index and the
// recipe list, built separately from the same map.
func GenerateFullItemListOutput(combinedItemMap map[string]*EVEType, categoryByGroupID map[int]int) map[string]*FullItem {
	fullItemList := make(map[string]*FullItem, len(combinedItemMap))
	for key, value := range combinedItemMap {
		fullItemList[key] = &FullItem{
			TypeID: value.ItemID,
			Name:   value.Name,
			// `MarketGroupID` holds the SDE's `groupID` — the inventory group, which is what a
			// category is looked up by. The market group is on `MarketSectionID`.
			CategoryID:    categoryByGroupID[value.MarketGroupID],
			GroupID:       value.MarketGroupID,
			FactionID:     value.FactionID,
			MarketGroupID: value.MarketSectionID,
		}
	}
	return fullItemList
}

// BuildCategoryByGroupID maps each group to the category it belongs to.
//
// A type names only its group, and what the SPA asks of an item — whether it is a ship — is a
// question about its category, so the two have to be joined before the item list is written.
func BuildCategoryByGroupID(groupsMap map[string]any) map[int]int {
	byGroupID := make(map[int]int, len(groupsMap))
	for key, value := range groupsMap {
		groupID, err := strconv.Atoi(key)
		if err != nil {
			continue
		}
		group, ok := value.(map[string]any)
		if !ok {
			continue
		}
		categoryID, ok := group["categoryID"].(float64)
		if !ok {
			continue
		}
		byGroupID[groupID] = int(categoryID)
	}
	return byGroupID
}
