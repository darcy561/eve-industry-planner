package plannersession

import (
	"context"
	"errors"
	"strings"
	"time"
)

// RevokeAllReport counts what an account-wide revoke ended.
type RevokeAllReport struct {
	Sessions int
	Tokens   int
}

// RevokeAllSessions ends every session an account holds, tombstoning each rather
// than deleting it so a refused request can say it was revoked.
func (s *Store) RevokeAllSessions(ctx context.Context, accountID string) (RevokeAllReport, error) {
	acc := strings.TrimSpace(accountID)
	if acc == "" {
		return RevokeAllReport{}, errors.New("plannersession: account id is required")
	}
	if _, err := s.handle(); err != nil {
		return RevokeAllReport{}, err
	}

	var report RevokeAllReport
	sessionIDs := map[string]struct{}{}

	// Tombstones first: a failure after this point leaves sessions already refused
	// rather than alive with nothing left to end them.
	if err := s.UpdateAccountRecord(ctx, acc, func(rec *AccountRecord) error {
		// Cleared on entry: this runs again on every compare-and-set retry.
		report = RevokeAllReport{}
		sessionIDs = map[string]struct{}{}

		now := time.Now().UTC()
		for sid, session := range rec.Sessions {
			sessionIDs[sid] = struct{}{}
			if session.RevokedAt != nil {
				continue
			}
			session.RevokedAt = &now
			rec.Sessions[sid] = session
			report.Sessions++
		}
		return nil
	}); err != nil {
		return RevokeAllReport{}, err
	}

	tokens, err := s.tokensForAccount(ctx, acc, sessionIDs)
	if err != nil {
		return report, err
	}
	for _, token := range tokens {
		if err := s.DeleteRefreshToken(ctx, token); err != nil {
			return report, err
		}
		report.Tokens++
	}
	return report, nil
}

// tokensForAccount collects an account's refresh tokens in one walk of the
// keyspace. A row is matched by its account id or by a session id being revoked,
// the second catching one written before the account id was recorded on it.
func (s *Store) tokensForAccount(ctx context.Context, accountID string, sessionIDs map[string]struct{}) ([]string, error) {
	var tokens []string
	err := s.EachRefreshTokenKey(ctx, func(keys []string) error {
		for _, token := range keys {
			data, found, err := s.RefreshToken(ctx, token)
			if err != nil || !found {
				continue
			}
			if strings.TrimSpace(data.AccountID) == accountID {
				tokens = append(tokens, token)
				continue
			}
			if _, revoking := sessionIDs[strings.TrimSpace(data.SessionID)]; revoking {
				tokens = append(tokens, token)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return tokens, nil
}
