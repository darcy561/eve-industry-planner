package cloudstoredesi

import "errors"

var (
	ErrUserNotFound     = errors.New("cloud esi: user document not found")
	ErrNotCloud         = errors.New("cloud esi: cloud storage mode is not enabled")
	ErrNoRow            = errors.New("cloud esi: character not linked for this account")
	ErrKeyring          = errors.New("cloud esi: refresh token keyring not configured")
	ErrDecrypt          = errors.New("cloud esi: stored refresh token unavailable")
	ErrInvalidGrant     = errors.New("cloud esi: invalid_grant from EVE SSO")
	ErrPersist          = errors.New("cloud esi: failed to persist rotation")
	ErrMissingAccountID = errors.New("cloud esi: account_id is required")
)
