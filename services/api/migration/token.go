package migration

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/firebaseadmin"

	"firebase.google.com/go/v4/auth"
)

// GenerateFirebaseCustomToken generates a Firebase custom token for the given accountID (UID).
// It mirrors the behavior of the existing Node generateToken function:
// - Checks if the user exists in Firebase Auth
// - For new users, provisions initial Firestore data via BuildNewUserFirestoreData
// - Returns a custom token and whether this is the first time login
func GenerateFirebaseCustomToken(ctx context.Context, accountID string) (string, bool, error) {
	if accountID == "" {
		return "", false, fmt.Errorf("accountID is required")
	}

	authClient, err := firebaseadmin.GetAuthClient(ctx)
	if err != nil {
		return "", false, fmt.Errorf("get firebase auth client: %w", err)
	}

	var userExists bool

	_, err = authClient.GetUser(ctx, accountID)
	if err != nil {
		if auth.IsUserNotFound(err) {
			userExists = false
			if err := BuildNewUserFirestoreData(ctx, accountID); err != nil {
				return "", false, fmt.Errorf("provision new user firestore data: %w", err)
			}
		} else {
			return "", false, fmt.Errorf("check firebase user: %w", err)
		}
	} else {
		userExists = true
	}

	token, err := authClient.CustomToken(ctx, accountID)
	if err != nil {
		return "", userExists, fmt.Errorf("create firebase custom token: %w", err)
	}

	return token, !userExists, nil
}
