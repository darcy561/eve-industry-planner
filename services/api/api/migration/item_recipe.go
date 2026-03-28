package migration

import (
	"context"
	"fmt"

	"cloud.google.com/go/firestore"
	"eve-industry-planner/shared/firebaseadmin"
)

const itemsCollection = "Items"

// GetItemRecipe fetches a single item recipe from Firestore Items collection.
// Returns (data, true) if found, (nil, false) if not found, or an error.
func GetItemRecipe(ctx context.Context, itemID string) (map[string]any, bool, error) {
	if itemID == "" {
		return nil, false, fmt.Errorf("itemID is required")
	}

	client, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("get firestore client: %w", err)
	}

	snap, err := client.Collection(itemsCollection).Doc(itemID).Get(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("get item document: %w", err)
	}
	if !snap.Exists() {
		return nil, false, nil
	}
	return snap.Data(), true, nil
}

// GetMultipleItemRecipes fetches item recipes for the given type IDs from Firestore using a batch read.
// Missing documents are skipped; returns only documents that exist (mirrors JS behavior).
func GetMultipleItemRecipes(ctx context.Context, typeIDs []string) ([]map[string]any, error) {
	if len(typeIDs) == 0 {
		return nil, fmt.Errorf("typeIDs cannot be empty")
	}

	client, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("get firestore client: %w", err)
	}

	// Prepare document references for batch Get
	docRefs := make([]*firestore.DocumentRef, 0, len(typeIDs))
	for _, id := range typeIDs {
		docRefs = append(docRefs, client.Collection(itemsCollection).Doc(id))
	}

	// Use GetAll for batch retrieval
	snaps, err := client.GetAll(ctx, docRefs)
	if err != nil {
		return nil, fmt.Errorf("batch get item documents: %w", err)
	}

	out := make([]map[string]any, 0, len(typeIDs))
	for _, snap := range snaps {
		if snap == nil || !snap.Exists() {
			continue
		}
		out = append(out, snap.Data())
	}

	return out, nil
}
