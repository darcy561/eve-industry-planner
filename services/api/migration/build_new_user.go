package migration

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/firebaseadmin"
	"eve-industry-planner/shared/logs"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Default values for new user Firestore documents (match frontend/functions/api/buildNewUserData.js)
const (
	usersCollection          = "Users"
	defaultCloudAccounts     = false
	defaultMarketOption      = "jita"
	defaultOrderOption       = "sell"
	defaultAssetLocation     = 60003760 // Jita 4-4
	defaultCitadelBrokersFee = 1
)

// EnsureUserFirestoreScaffold creates the initial Firestore layout when missing: main Users/{accountID}
// document plus ProfileInfo docs (Watchlist, JobSnapshot, GroupData) expected by the app listeners
// during login. If the main user document already exists, this is a no-op so existing data is not
// overwritten. Uses a single Firestore transaction.
func EnsureUserFirestoreScaffold(ctx context.Context, accountID string) error {
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

	var created bool
	err = client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(userDocRef)
		if err != nil {
			// Missing user doc is expected for first login; create scaffold below.
			if status.Code(err) != codes.NotFound {
				return err
			}
		}
		if err == nil && snap.Exists() {
			return nil
		}

		created = true
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

	if created {
		logs.InfoCtx(ctx, "created user firestore scaffold (main doc + ProfileInfo)", "account_id", accountID)
	}
	return nil
}

// buildUserDocData returns the main user document map matching the JS structure.
func buildUserDocData(accountID string) map[string]any {
	jobStatuses := map[string]any{
		"0": map[string]any{"name": "Planning"},
		"1": map[string]any{"name": "Purchasing"},
		"2": map[string]any{"name": "Building"},
		"3": map[string]any{"name": "Complete"},
		"4": map[string]any{"name": "For Sale"},
	}

	settings := map[string]any{
		"account": map[string]any{
			"cloudAccounts": defaultCloudAccounts,
		},
		"layout": map[string]any{
			"hideTutorials": false,
			"esiJobTab":     nil,
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
		"jobStatuses": jobStatuses,
	}

	return map[string]any{
		"accountID": accountID,
		"deleted":   nil,
		"linkedJobs":     []any{},
		"linkedTrans":    []any{},
		"linkedOrders":   []any{},
		"settings":       settings,
		"refreshTokens":  []any{},
	}
}
