package migration

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/firebaseadmin"

	"firebase.google.com/go/v4/auth"
	"firebase.google.com/go/v4/errorutils"
)

// GenerateFirebaseCustomToken generates a Firebase custom token for the given accountID (UID).
// Ensures a Firebase Auth user exists (creates one with that UID if missing) and ensures the
// legacy Firestore scaffold exists (main user doc + ProfileInfo Watchlist / JobSnapshot / GroupData)
// so client listeners used during login receive documents. Application settings and account rows
// remain owned by MongoDB.
func GenerateFirebaseCustomToken(ctx context.Context, accountID string) (string, bool, error) {
	if accountID == "" {
		return "", false, fmt.Errorf("accountID is required")
	}

	authClient, err := firebaseadmin.GetAuthClient(ctx)
	if err != nil {
		return "", false, fmt.Errorf("get firebase auth client: %w", err)
	}

	userExists := true
	_, err = authClient.GetUser(ctx, accountID)
	if err != nil {
		if !auth.IsUserNotFound(err) {
			return "", false, fmt.Errorf("check firebase user: %w", err)
		}
		userExists = false
		_, cerr := authClient.CreateUser(ctx, (&auth.UserToCreate{}).UID(accountID))
		if cerr != nil {
			if errorutils.IsAlreadyExists(cerr) {
				userExists = true
			} else {
				return "", false, fmt.Errorf("create firebase auth user: %w", cerr)
			}
		}
	}

	if err := EnsureUserFirestoreScaffold(ctx, accountID); err != nil {
		return "", userExists, fmt.Errorf("ensure firestore scaffold: %w", err)
	}

	token, err := authClient.CustomToken(ctx, accountID)
	if err != nil {
		return "", userExists, fmt.Errorf("create firebase custom token: %w", err)
	}

	return token, !userExists, nil
}
