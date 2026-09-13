package conversion

import (
	"sort"
	"strconv"
)

// GenerateMarketGroupsOutput names each market group and says what sits around it.
//
// The SPA reads it to answer what a flat list cannot: what a group is called,
// which group to ask next when the one an item sits in has nothing to say, and
// what a reader browsing the tree can open. A default set on "Minerals" has to
// cover Tritanium, so the parent link is the point of the file; the child links
// are what let a player find "Minerals" without knowing it is there.
//
// Groups whose parent is missing from the source are kept as roots rather than
// dropped: a name is still worth having, and a walk that ends early is better
// than an item with no group at all.
//
// items is the published item list, read only for which groups hold something
// directly. Passing nil leaves every group's HasTypes false, which is what a
// caller with no list should get rather than a guess.
func GenerateMarketGroupsOutput(marketGroupsMap map[string]any, items map[string]*FullItem) map[string]*MarketGroup {
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

	linkChildren(groups)
	markGroupsHoldingTypes(groups, items)
	chooseIconTypes(groups, items)

	return groups
}

// chooseIconTypes gives each group an item to be recognised by.
//
// The lowest type id in a group, so the same source always picks the same item
// and a rebuilt file can still be compared to the last one. A group holding
// nothing directly borrows from the branch beneath it, which is what makes a
// container recognisable rather than blank.
func chooseIconTypes(groups map[string]*MarketGroup, items map[string]*FullItem) {
	direct := make(map[int]int, len(groups))
	for _, item := range items {
		if item == nil || item.MarketGroupID == 0 {
			continue
		}
		if held, ok := direct[item.MarketGroupID]; !ok || item.TypeID < held {
			direct[item.MarketGroupID] = item.TypeID
		}
	}

	for key, entry := range groups {
		id, err := strconv.Atoi(key)
		if err != nil {
			continue
		}
		entry.IconTypeID = inheritedIconType(groups, direct, id, 0)
	}
}

// inheritedIconType is a group's own item, or the first one found beneath it.
//
// Depth-capped for the same reason the SPA's walk is: a cycle in the source would
// otherwise recurse forever, and this runs once per group.
func inheritedIconType(groups map[string]*MarketGroup, direct map[int]int, id, depth int) int {
	if depth > maxIconSearchDepth {
		return 0
	}
	if held, ok := direct[id]; ok {
		return held
	}

	entry, ok := groups[strconv.Itoa(id)]
	if !ok {
		return 0
	}
	for _, child := range entry.Children {
		if held := inheritedIconType(groups, direct, child, depth+1); held != 0 {
			return held
		}
	}

	return 0
}

// EVE's market tree is six groups deep; this is the margin over that, so a
// legitimate deepening is not silently truncated.
const maxIconSearchDepth = 32

// linkChildren fills each group's Children from the parent links already set.
//
// Built here rather than in the SPA because the answer is the same in every
// session and this side already holds the map: a reader browsing the tree would
// otherwise invert two thousand entries on first open.
//
// Sorted by id so a rebuild of the same source produces the same file, which is
// what lets the published output be compared between builds.
func linkChildren(groups map[string]*MarketGroup) {
	for key, entry := range groups {
		if entry.ParentID == 0 {
			continue
		}
		parent, ok := groups[strconv.Itoa(entry.ParentID)]
		if !ok {
			continue
		}
		id, err := strconv.Atoi(key)
		if err != nil {
			continue
		}
		parent.Children = append(parent.Children, id)
	}

	for _, entry := range groups {
		sort.Ints(entry.Children)
	}
}

// markGroupsHoldingTypes says which groups items sit in directly.
//
// Taken from the published item list rather than from the source's own flag, so
// it answers the question a reader actually has — whether this group holds
// anything the app knows about — rather than what the SDE says about types the
// item list may never carry.
func markGroupsHoldingTypes(groups map[string]*MarketGroup, items map[string]*FullItem) {
	for _, item := range items {
		if item == nil || item.MarketGroupID == 0 {
			continue
		}
		if entry, ok := groups[strconv.Itoa(item.MarketGroupID)]; ok {
			entry.HasTypes = true
		}
	}
}
