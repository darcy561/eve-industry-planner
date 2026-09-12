package conversion

import "strconv"

// GenerateMarketGroupsOutput names each market group and says what contains it.
//
// The SPA reads it to answer two questions a flat list cannot: what a group is
// called, and which group to ask next when the one an item sits in has nothing to
// say. A default set on "Minerals" has to cover Tritanium, so the parent link is
// the point of the file.
//
// Groups whose parent is missing from the source are kept as roots rather than
// dropped: a name is still worth having, and a walk that ends early is better
// than an item with no group at all.
func GenerateMarketGroupsOutput(marketGroupsMap map[string]any) map[string]*MarketGroup {
	groups := make(map[string]*MarketGroup, len(marketGroupsMap))

	for key, value := range marketGroupsMap {
		group, ok := value.(map[string]any)
		if !ok {
			continue
		}
		name, ok := localisedName(group)
		if !ok {
			continue
		}

		entry := &MarketGroup{Name: name}
		if parentID, ok := group["parentGroupID"].(float64); ok && parentID != 0 {
			if _, exists := marketGroupsMap[strconv.Itoa(int(parentID))]; exists {
				entry.ParentID = int(parentID)
			}
		}
		groups[key] = entry
	}

	return groups
}
