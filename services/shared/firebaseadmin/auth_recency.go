package firebaseadmin

import (
	"context"
	"time"

	"firebase.google.com/go/v4/auth"
)

// DefaultRecencyForActiveAccounts limits scan-all Firestore→Mongo migrations to Firebase Auth
// users whose last sign-in, or account creation if last sign-in is unset, falls within this window
// (approximately the last 2 years).
const DefaultRecencyForActiveAccounts = 2 * 365 * 24 * time.Hour

// AccountHasAuthActivitySince returns true when maxAge is 0 (no filtering).
// Otherwise it loads the Firebase Auth user and returns true when the effective activity time
// (last sign-in if set, else account creation) is not before now.Add(-maxAge).
// Missing Auth user, user-not-found, or no usable timestamps return false, nil.
func AccountHasAuthActivitySince(ctx context.Context, accountID string, maxAge time.Duration) (bool, error) {
	if maxAge == 0 {
		return true, nil
	}
	if accountID == "" {
		return false, nil
	}
	cutoff := time.Now().UTC().Add(-maxAge)
	c, err := GetAuthClient(ctx)
	if err != nil {
		return false, err
	}
	u, err := c.GetUser(ctx, accountID)
	if err != nil {
		if auth.IsUserNotFound(err) {
			return false, nil
		}
		return false, err
	}
	t, ok := effectiveAuthActivityTime(u)
	if !ok {
		return false, nil
	}
	return !t.Before(cutoff), nil
}

func effectiveAuthActivityTime(u *auth.UserRecord) (time.Time, bool) {
	if u == nil || u.UserMetadata == nil {
		return time.Time{}, false
	}
	var lastLogin, created time.Time
	if u.UserMetadata.LastLogInTimestamp > 0 {
		lastLogin = time.Unix(0, u.UserMetadata.LastLogInTimestamp*int64(time.Millisecond)).UTC()
	}
	if u.UserMetadata.CreationTimestamp > 0 {
		created = time.Unix(0, u.UserMetadata.CreationTimestamp*int64(time.Millisecond)).UTC()
	}
	if !lastLogin.IsZero() {
		return lastLogin, true
	}
	if !created.IsZero() {
		return created, true
	}
	return time.Time{}, false
}
