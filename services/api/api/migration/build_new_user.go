package migration

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/shared/logs"

	"cloud.google.com/go/firestore"
)

// Default values for new user Firestore documents (match frontend/functions/api/buildNewUserData.js)
const (
	defaultCloudAccounts     = false
	defaultMarketOption      = "jita"
	defaultOrderOption       = "sell"
	defaultAssetLocation     = 60003760 // Jita 4-4
	defaultCitadelBrokersFee = 1
)

// BuildNewUserFirestoreData creates the initial Firestore document structure for a new user.
// It mirrors the JS buildNewUserdata function: main user doc + ProfileInfo subcollections
// (Watchlist, JobSnapshot, GroupData). Uses a Firestore transaction for atomic creation.
func BuildNewUserFirestoreData(ctx context.Context, accountID string) error {
	if accountID == "" {
		return fmt.Errorf("accountID is required")
	}

	client, err := firebaseadmin.GetFirestoreClient(ctx)
	if err != nil {
		return fmt.Errorf("get firestore client: %w", err)
	}

	userDocRef := client.Collection(usersCollection).Doc(accountID)
	watchlistRef := client.Collection(usersCollection).Doc(accountID).Collection("ProfileInfo").Doc("Watchlist")
	jobSnapshotRef := client.Collection(usersCollection).Doc(accountID).Collection("ProfileInfo").Doc("JobSnapshot")
	groupDataRef := client.Collection(usersCollection).Doc(accountID).Collection("ProfileInfo").Doc("GroupData")

	userDocData := buildUserDocData(accountID)
	watchlistDoc := map[string]any{"groups": []any{}, "items": []any{}}
	jobSnapshotDoc := map[string]any{"snapshot": []any{}}
	groupDataDoc := map[string]any{"groupData": []any{}}

	err = client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		if err := tx.Set(userDocRef, userDocData); err != nil {
			return err
		}
		if err := tx.Set(watchlistRef, watchlistDoc); err != nil {
			return err
		}
		if err := tx.Set(jobSnapshotRef, jobSnapshotDoc); err != nil {
			return err
		}
		if err := tx.Set(groupDataRef, groupDataDoc); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("firestore transaction: %w", err)
	}

	logs.InfoCtx(ctx, "new user firestore data created", "account_id", accountID)
	return nil
}

// buildUserDocData returns the main user document map matching the JS structure.
func buildUserDocData(accountID string) map[string]any {
	jobStatusArray := []any{
		map[string]any{"id": int64(0), "name": "Planning", "sortOrder": int64(0), "expanded": true, "openAPIJobs": false, "completeAPIJobs": false},
		map[string]any{"id": int64(1), "name": "Purchasing", "sortOrder": int64(1), "expanded": true, "openAPIJobs": false, "completeAPIJobs": false},
		map[string]any{"id": int64(2), "name": "Building", "sortOrder": int64(2), "expanded": true, "openAPIJobs": false, "completeAPIJobs": false},
		map[string]any{"id": int64(3), "name": "Complete", "sortOrder": int64(3), "expanded": true, "openAPIJobs": false, "completeAPIJobs": false},
		map[string]any{"id": int64(4), "name": "For Sale", "sortOrder": int64(4), "expanded": true, "openAPIJobs": false, "completeAPIJobs": false},
	}

	settings := map[string]any{
		"account": map[string]any{
			"cloudAccounts": defaultCloudAccounts,
		},
		"layout": map[string]any{
			"hideTutorials":      false,
			"localMarketDisplay": nil,
			"localOrderDisplay":  nil,
			"esiJobTab":          nil,
		},
		"editJob": map[string]any{
			"defaultMarket":         defaultMarketOption,
			"defaultOrders":         defaultOrderOption,
			"hideCompleteMaterials": false,
			"defaultAssetLocation":  int64(defaultAssetLocation),
			"citadelBrokersFee":     float64(defaultCitadelBrokersFee),
		},
		"structures": map[string]any{
			"manufacturing": []any{},
			"reaction":      []any{},
			"reprocessing":  []any{},
		},
	}

	return map[string]any{
		"accountID":      accountID,
		"jobStatusArray": jobStatusArray,
		"deleted":        nil,
		"linkedJobs":     []any{},
		"linkedTrans":    []any{},
		"linkedOrders":   []any{},
		"settings":       settings,
		"refreshTokens":  []any{},
	}
}
