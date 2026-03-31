package conversion

func GenerateSearchIndexOutput(recipeList []*EVEType) []*ItemName {
	searchItems := make([]*ItemName, len(recipeList))
	for i, item := range recipeList {
		searchItems[i] = &ItemName{
			Name:        item.Name,
			ItemID:      item.ItemID,
			BlueprintID: item.BlueprintTypeID,
			JobType:     item.JobType,
		}
	}
	return searchItems
}
