package subscriptionlogic

import "fmt"

func BuildScopedDocSet(newSubscriptions map[string][]string) map[string]bool {
	newSet := make(map[string]bool)
	for collectionName, documentIDs := range newSubscriptions {
		for _, docID := range documentIDs {
			if docID == "" {
				continue
			}
			newSet[fmt.Sprintf("%s.%s", collectionName, docID)] = true
		}
	}
	return newSet
}

func Keys(docMap map[string]bool) []string {
	keys := make([]string, 0, len(docMap))
	for k := range docMap {
		keys = append(keys, k)
	}
	return keys
}
