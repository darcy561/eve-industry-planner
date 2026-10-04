package cloudstoredesi

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/evesso"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

const refreshTimeout = 30 * time.Second

// Result is one character's outcome. Err is why that character has no token, and says nothing about
// the others: one dead credential does not deny the rest of an account its tokens.
type Result struct {
	CharacterHash string
	Token         *evesso.EveSSOTokenPayload
	Err           error
}

// RefreshStoredEsiForCharacters exchanges the encrypted refresh material held for each named
// character, and persists every rotation in one write.
//
// An empty characterHashes refreshes every row the account holds, which is what login does.
//
// The document is read once and the rotated rows written once, so refreshing several characters
// costs one read and one write rather than one of each per character. reportSSO is told what the
// token exchange saw and nothing else: a failure to read a document says nothing about whether EVE
// SSO is answering.
func RefreshStoredEsiForCharacters(ctx context.Context, mongo *eipmongo.Mongo, accountID string, characterHashes []string, cfg *config.CloudStoredESI, reportSSO func(error)) ([]Result, error) {
	if cfg == nil {
		return nil, fmt.Errorf("cloud esi: config is nil")
	}
	if mongo == nil {
		return nil, fmt.Errorf("cloud esi: mongo handle is nil")
	}
	if strings.TrimSpace(accountID) == "" {
		return nil, ErrMissingAccountID
	}
	if cfg.Keys.Keyring == nil {
		return nil, ErrKeyring
	}

	usersCol := mongo.Users.Collection()
	if usersCol == nil {
		return nil, fmt.Errorf("cloud esi: users collection unavailable")
	}

	var userDoc models.UserAccountDocument
	if err := usersCol.FindOne(ctx, eipmongo.AccountDocumentFilter(accountID)).Decode(&userDoc); err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("cloud esi: %w", err)
	}
	if !userDoc.UserCloudAccounts {
		return nil, ErrNotCloud
	}

	wanted := requestedRows(&userDoc, characterHashes)
	results := make([]Result, 0, len(wanted))
	changed := make([]models.RefreshToken, 0, len(wanted))

	for _, row := range wanted {
		if row.row == nil {
			results = append(results, Result{CharacterHash: row.hash, Err: ErrNoRow})
			continue
		}
		tok, err := refreshRow(ctx, row.row, cfg, reportSSO)
		if err != nil {
			results = append(results, Result{CharacterHash: row.row.CharacterHash, Err: err})
			continue
		}
		changed = append(changed, *row.row)
		results = append(results, Result{CharacterHash: row.row.CharacterHash, Token: tok})
	}

	if err := mongo.Users.PatchUserRefreshTokenRows(ctx, accountID, changed,
		eipmongo.WithOpName("persist cloud-stored ESI refresh rotation")); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrPersist, err)
	}

	return results, nil
}

// RefreshStoredEsiForCharacter is the single-character case, with the outcome as a return value
// rather than a Result.
func RefreshStoredEsiForCharacter(ctx context.Context, mongo *eipmongo.Mongo, accountID, characterHash string, cfg *config.CloudStoredESI, reportSSO func(error)) (*evesso.EveSSOTokenPayload, error) {
	if strings.TrimSpace(characterHash) == "" {
		return nil, fmt.Errorf("cloud esi: character_hash required")
	}
	results, err := RefreshStoredEsiForCharacters(ctx, mongo, accountID, []string{characterHash}, cfg, reportSSO)
	if err != nil {
		return nil, err
	}
	if len(results) != 1 {
		return nil, ErrNoRow
	}
	if results[0].Err != nil {
		return nil, results[0].Err
	}
	return results[0].Token, nil
}

type requestedRow struct {
	hash string
	row  *models.RefreshToken
}

// requestedRows pairs each asked-for hash with its stored row, preserving the caller's order so a
// result can be matched back. Stored hashes are matched case-insensitively, as everything else that
// reads this array does.
func requestedRows(userDoc *models.UserAccountDocument, characterHashes []string) []requestedRow {
	if len(characterHashes) == 0 {
		out := make([]requestedRow, 0, len(userDoc.RefreshTokens))
		for i := range userDoc.RefreshTokens {
			if userDoc.RefreshTokens[i].CharacterHash == "" {
				continue
			}
			out = append(out, requestedRow{hash: userDoc.RefreshTokens[i].CharacterHash, row: &userDoc.RefreshTokens[i]})
		}
		return out
	}

	out := make([]requestedRow, 0, len(characterHashes))
	// Asked for twice is refreshed once: a second exchange would spend the refresh token the first
	// one just rotated, for a result the caller already has.
	seen := make(map[string]struct{}, len(characterHashes))
	for _, hash := range characterHashes {
		hash = strings.TrimSpace(hash)
		if hash == "" {
			continue
		}
		key := strings.ToLower(hash)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		found := requestedRow{hash: hash}
		for i := range userDoc.RefreshTokens {
			if strings.EqualFold(userDoc.RefreshTokens[i].CharacterHash, hash) {
				found.row = &userDoc.RefreshTokens[i]
				break
			}
		}
		out = append(out, found)
	}
	return out
}

// refreshRow exchanges one row's material and re-encrypts it in place, leaving the caller to persist.
func refreshRow(ctx context.Context, row *models.RefreshToken, cfg *config.CloudStoredESI, reportSSO func(error)) (*evesso.EveSSOTokenPayload, error) {
	plain, err := row.PlainRefreshMaterial(cfg.Keys.Keyring)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecrypt, err)
	}

	refreshCtx, cancel := context.WithTimeout(ctx, refreshTimeout)
	defer cancel()

	tok, err := evesso.RefreshEveSSOAccessToken(refreshCtx, cfg.SSO.ClientID, cfg.SSO.ClientSecret, plain)
	if reportSSO != nil {
		reportSSO(err)
	}
	if err != nil {
		if evesso.IsPermanentRefreshFailure(err) {
			return nil, fmt.Errorf("%w: %v", ErrInvalidGrant, err)
		}
		return nil, fmt.Errorf("cloud esi: %w", err)
	}

	newRefresh := tok.RefreshToken
	if newRefresh == "" {
		newRefresh = plain
	}
	if err := row.EncryptRefreshAtRest(newRefresh, cfg.Keys.Keyring); err != nil {
		return nil, fmt.Errorf("cloud esi: encrypt: %w", err)
	}
	return tok, nil
}
