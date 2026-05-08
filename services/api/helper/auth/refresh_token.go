package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"eve-industry-planner/shared/core/internaljwt"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

var ErrRefreshTokenNotFound = errors.New("refresh token not found")

const (
	// RefreshTokenTTL is how long planner app session refresh-token keys live in Redis (also the basis for SessionTTL).
	// This TTL applies to opaque planner tokens only — not ESI OAuth refresh secrets (those live in Mongo / client).
	RefreshTokenTTL = 7 * 24 * time.Hour
	// RefreshTokenKeyPrefix is the Redis key prefix for planner app session refresh tokens (refresh_token:<token>).
	RefreshTokenKeyPrefix = "refresh_token:"
	// CorporationKeyPrefix is the Redis key prefix for storing corporation IDs by account ID
	CorporationKeyPrefix = "custom_claims_corporations:"
	// AllianceKeyPrefix is the Redis key prefix for storing alliance IDs by account ID
	AllianceKeyPrefix = "custom_claims_alliances:"
	// CorporationTTL is how long corporation/alliance ID caches live in Redis (30 days)
	CorporationTTL = 30 * 24 * time.Hour
	// SessionKeyPrefix is the Redis key prefix for session records.
	SessionKeyPrefix = "session:"
	// AccountSessionsKeyPrefix is the Redis key prefix for account scoped sessions.
	AccountSessionsKeyPrefix = "account_sessions:"
	// SessionIndexKeyPrefix maps session_id -> account_id for fast lookup.
	SessionIndexKeyPrefix = "session_index:"
	// SessionTTL matches RefreshTokenTTL so session:<id> ages out with the refresh-token window.
	SessionTTL = RefreshTokenTTL
)

// RefreshTokenData is metadata bound to a planner app session refresh token in Redis (not ESI OAuth refresh material).
type RefreshTokenData struct {
	CharacterHash string                     `json:"character_hash"`
	AccountID     string                     `json:"account_id"`
	Scopes        []string                   `json:"scopes"`
	Corporations  internaljwt.CorporationIDs `json:"corporations,omitempty"` // Corporation IDs the user can access
	Alliances     internaljwt.AllianceIDs    `json:"alliances,omitempty"`    // Alliance IDs derived from character affiliation
	SessionID     string                     `json:"session_id,omitempty"`
	SessionStart  time.Time                  `json:"session_start,omitempty"`
	SessionSeenAt time.Time                  `json:"session_seen_at,omitempty"`
	AppVersion    string                     `json:"app_version,omitempty"`
}

// SessionRecord stores a lightweight auth session timeline in Redis.
type SessionRecord struct {
	SessionID     string    `json:"session_id"`
	AccountID     string    `json:"account_id"`
	CharacterHash string    `json:"character_hash"`
	AppVersion    string    `json:"app_version,omitempty"`
	StartedAt     time.Time `json:"started_at"`
	LastSeenAt    time.Time `json:"last_seen_at"`
}

type SessionGrants struct {
	CorporationIDs []int64 `json:"corporation_ids,omitempty"`
	AllianceIDs    []int64 `json:"alliance_ids,omitempty"`
}

type AccountSession struct {
	SessionID        string        `json:"session_id"`
	CharacterHash    string        `json:"character_hash"`
	AppVersion       string        `json:"app_version,omitempty"`
	StartedAt        time.Time     `json:"started_at"`
	LastSeenAt       time.Time     `json:"last_seen_at"`
	ReauthRequiredAt time.Time     `json:"reauth_required_at"`
	RevokedAt        *time.Time    `json:"revoked_at,omitempty"`
	Grants           SessionGrants `json:"grants,omitempty"`
}

type AccountSessionsRecord struct {
	AccountID     string                    `json:"account_id"`
	Grants        SessionGrants             `json:"grants,omitempty"`
	Sessions      map[string]AccountSession `json:"sessions"`
	GrantsVersion int64                     `json:"grants_version,omitempty"`
	UpdatedAt     time.Time                 `json:"updated_at"`
}

// GenerateRefreshToken generates a secure random refresh token
func GenerateRefreshToken() (string, error) {
	// Generate a UUID for the token
	u, err := uuid.NewRandom()
	if err != nil {
		// Fallback to random bytes if UUID fails
		bytes := make([]byte, 32)
		if _, err := rand.Reader.Read(bytes); err != nil {
			return "", fmt.Errorf("failed to generate refresh token: %w", err)
		}
		return base64.URLEncoding.EncodeToString(bytes), nil
	}
	return u.String(), nil
}

// GenerateSessionID generates a session identifier.
func GenerateSessionID() (string, error) {
	return GenerateRefreshToken()
}

// StoreRefreshToken stores a refresh token in Redis with associated user data
func StoreRefreshToken(ctx context.Context, redisClient *redis.Client, token string, data RefreshTokenData) error {
	key := RefreshTokenKeyPrefix + token
	if err := rediscore.SaveJSON(ctx, redisClient, key, data, RefreshTokenTTL); err != nil {
		return fmt.Errorf("failed to store refresh token: %w", err)
	}
	return nil
}

// UpsertSessionRecord creates/updates a session record in Redis.
func UpsertSessionRecord(ctx context.Context, redisClient *redis.Client, record SessionRecord) error {
	if record.SessionID == "" {
		return errors.New("session_id is required")
	}
	if strings.TrimSpace(record.AccountID) == "" {
		return errors.New("account_id is required")
	}
	now := time.Now().UTC()
	s := AccountSession{
		SessionID:        record.SessionID,
		CharacterHash:    record.CharacterHash,
		AppVersion:       record.AppVersion,
		StartedAt:        record.StartedAt,
		LastSeenAt:       record.LastSeenAt,
		ReauthRequiredAt: record.StartedAt.Add(RefreshTokenTTL),
	}
	if s.StartedAt.IsZero() {
		s.StartedAt = now
	}
	if s.LastSeenAt.IsZero() {
		s.LastSeenAt = now
	}
	if s.ReauthRequiredAt.IsZero() {
		s.ReauthRequiredAt = s.StartedAt.Add(RefreshTokenTTL)
	}
	if err := UpsertAccountSession(ctx, redisClient, record.AccountID, s); err != nil {
		return fmt.Errorf("failed to store session record: %w", err)
	}
	return nil
}

// GetSessionRecord loads session:<sessionID> from Redis.
func GetSessionRecord(ctx context.Context, redisClient *redis.Client, sessionID string) (*SessionRecord, error) {
	accountID, s, err := ResolveAccountSessionBySessionID(ctx, redisClient, sessionID)
	if err != nil {
		return nil, err
	}
	return &SessionRecord{
		SessionID:     s.SessionID,
		AccountID:     accountID,
		CharacterHash: s.CharacterHash,
		AppVersion:    s.AppVersion,
		StartedAt:     s.StartedAt,
		LastSeenAt:    s.LastSeenAt,
	}, nil
}

// DeleteSessionRecord removes session:<sessionID> from Redis. Empty sessionID is a no-op.
func DeleteSessionRecord(ctx context.Context, redisClient *redis.Client, sessionID string) error {
	sid := strings.TrimSpace(sessionID)
	if sid == "" {
		return nil
	}
	if redisClient == nil {
		return errors.New("redis client is nil")
	}
	accountID, err := GetAccountIDBySessionID(ctx, redisClient, sid)
	if err != nil {
		return nil
	}
	return RevokeAccountSession(ctx, redisClient, accountID, sid)
}

// GetRefreshTokenData retrieves refresh token data from Redis
func GetRefreshTokenData(ctx context.Context, redisClient *redis.Client, token string) (*RefreshTokenData, error) {
	key := RefreshTokenKeyPrefix + token

	var data RefreshTokenData
	err := rediscore.GetJSON(ctx, redisClient, key, &data)
	if err == redis.Nil {
		return nil, ErrRefreshTokenNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get refresh token: %w", err)
	}

	return &data, nil
}

// RevokeRefreshToken removes a refresh token from Redis
func RevokeRefreshToken(ctx context.Context, redisClient *redis.Client, token string) error {
	key := RefreshTokenKeyPrefix + token
	return redisClient.Del(ctx, key).Err()
}

// StoreCorporations stores corporation IDs for an account ID in Redis
// AccountID should be the same for all characters belonging to the same internal account
func StoreCorporations(ctx context.Context, redisClient *redis.Client, accountID string, corporationIDs []int64) error {
	if accountID == "" {
		return errors.New("account ID cannot be empty")
	}

	key := CorporationKeyPrefix + accountID
	if err := rediscore.SaveJSON(ctx, redisClient, key, corporationIDs, CorporationTTL); err != nil {
		return fmt.Errorf("failed to store corporation IDs: %w", err)
	}

	return nil
}

// GetCorporations retrieves corporation IDs for an account ID from Redis
// Returns all corporations for all characters belonging to that account
// Returns empty array on error or if not found (errors are logged internally)
func GetCorporations(ctx context.Context, redisClient *redis.Client, accountID string) []int64 {
	if accountID == "" {
		return []int64{}
	}

	key := CorporationKeyPrefix + accountID

	var corporationIDs []int64
	err := rediscore.GetJSON(ctx, redisClient, key, &corporationIDs)
	if err == redis.Nil {
		// No corporations stored yet, return empty slice
		return []int64{}
	}
	if err != nil {
		// Log error but return empty array - don't fail the request
		logs.DebugCtx(ctx, "failed to get corporation IDs from Redis", "error", err, "account_id", accountID)
		return []int64{}
	}

	return corporationIDs
}

// StoreAlliances stores alliance IDs for an account ID in Redis (parallel to StoreCorporations).
func StoreAlliances(ctx context.Context, redisClient *redis.Client, accountID string, allianceIDs []int64) error {
	if accountID == "" {
		return errors.New("account ID cannot be empty")
	}

	key := AllianceKeyPrefix + accountID
	if err := rediscore.SaveJSON(ctx, redisClient, key, allianceIDs, CorporationTTL); err != nil {
		return fmt.Errorf("failed to store alliance IDs: %w", err)
	}

	return nil
}

// GetAlliances retrieves alliance IDs for an account ID from Redis.
func GetAlliances(ctx context.Context, redisClient *redis.Client, accountID string) []int64 {
	if accountID == "" {
		return []int64{}
	}

	key := AllianceKeyPrefix + accountID

	var allianceIDs []int64
	err := rediscore.GetJSON(ctx, redisClient, key, &allianceIDs)
	if err == redis.Nil {
		return []int64{}
	}
	if err != nil {
		logs.DebugCtx(ctx, "failed to get alliance IDs from Redis", "error", err, "account_id", accountID)
		return []int64{}
	}

	return allianceIDs
}

// GetAccountIDFromCharacterHash extracts AccountID from a character hash
// This is the same logic used in GenerateInternalJWT
func GetAccountIDFromCharacterHash(characterHash string) string {
	alphanumericRegex := regexp.MustCompile(`[^a-zA-Z0-9]`)
	return alphanumericRegex.ReplaceAllString(characterHash, "")
}

func accountSessionsKey(accountID string) string {
	return AccountSessionsKeyPrefix + strings.TrimSpace(accountID)
}

func sessionIndexKey(sessionID string) string {
	return SessionIndexKeyPrefix + strings.TrimSpace(sessionID)
}

func normalizeIDs(ids []int64) []int64 {
	if len(ids) == 0 {
		return []int64{}
	}
	m := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		if id > 0 {
			m[id] = struct{}{}
		}
	}
	out := make([]int64, 0, len(m))
	for id := range m {
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func pruneExpiredSessions(rec *AccountSessionsRecord, now time.Time) bool {
	if rec == nil || len(rec.Sessions) == 0 {
		return false
	}
	changed := false
	for sessionID, session := range rec.Sessions {
		if session.ReauthRequiredAt.IsZero() {
			session.ReauthRequiredAt = session.StartedAt.Add(RefreshTokenTTL)
			rec.Sessions[sessionID] = session
			changed = true
		}
		if !session.ReauthRequiredAt.IsZero() && now.After(session.ReauthRequiredAt) {
			delete(rec.Sessions, sessionID)
			changed = true
		}
	}
	return changed
}

func GetAccountSessionsRecord(ctx context.Context, redisClient *redis.Client, accountID string) (*AccountSessionsRecord, error) {
	acc := strings.TrimSpace(accountID)
	if acc == "" {
		return nil, errors.New("account_id is required")
	}
	if redisClient == nil {
		return nil, errors.New("redis client is nil")
	}
	key := accountSessionsKey(acc)
	var rec AccountSessionsRecord
	err := rediscore.GetJSON(ctx, redisClient, key, &rec)
	if err == redis.Nil {
		return &AccountSessionsRecord{
			AccountID: acc,
			Grants: SessionGrants{
				CorporationIDs: []int64{},
				AllianceIDs:    []int64{},
			},
			Sessions:  map[string]AccountSession{},
			UpdatedAt: time.Now().UTC(),
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get account sessions: %w", err)
	}
	if rec.AccountID == "" {
		rec.AccountID = acc
	}
	if rec.Sessions == nil {
		rec.Sessions = map[string]AccountSession{}
	}
	if rec.Grants.CorporationIDs == nil {
		rec.Grants.CorporationIDs = []int64{}
	}
	if rec.Grants.AllianceIDs == nil {
		rec.Grants.AllianceIDs = []int64{}
	}
	now := time.Now().UTC()
	if pruneExpiredSessions(&rec, now) {
		rec.UpdatedAt = now
		if saveErr := rediscore.SaveJSON(ctx, redisClient, key, rec, SessionTTL); saveErr != nil {
			logs.WarnCtx(ctx, "failed to persist pruned account sessions", "account_id", acc, "error", saveErr)
		}
	}
	return &rec, nil
}

func SaveAccountSessionsRecord(ctx context.Context, redisClient *redis.Client, rec *AccountSessionsRecord) error {
	if rec == nil {
		return errors.New("account sessions record is nil")
	}
	acc := strings.TrimSpace(rec.AccountID)
	if acc == "" {
		return errors.New("account_id is required")
	}
	if redisClient == nil {
		return errors.New("redis client is nil")
	}
	if rec.Sessions == nil {
		rec.Sessions = map[string]AccountSession{}
	}
	rec.Grants.CorporationIDs = normalizeIDs(rec.Grants.CorporationIDs)
	rec.Grants.AllianceIDs = normalizeIDs(rec.Grants.AllianceIDs)
	rec.UpdatedAt = time.Now().UTC()
	if err := rediscore.SaveJSON(ctx, redisClient, accountSessionsKey(acc), rec, SessionTTL); err != nil {
		return fmt.Errorf("failed to save account sessions: %w", err)
	}
	return nil
}

func UpsertAccountSession(ctx context.Context, redisClient *redis.Client, accountID string, session AccountSession) error {
	acc := strings.TrimSpace(accountID)
	sid := strings.TrimSpace(session.SessionID)
	if acc == "" || sid == "" {
		return errors.New("account_id and session_id are required")
	}
	rec, err := GetAccountSessionsRecord(ctx, redisClient, acc)
	if err != nil {
		return err
	}
	if rec.Sessions == nil {
		rec.Sessions = map[string]AccountSession{}
	}
	now := time.Now().UTC()
	if session.StartedAt.IsZero() {
		session.StartedAt = now
	}
	if session.LastSeenAt.IsZero() {
		session.LastSeenAt = now
	}
	if session.ReauthRequiredAt.IsZero() {
		session.ReauthRequiredAt = session.StartedAt.Add(RefreshTokenTTL)
	}
	session.Grants = rec.Grants
	rec.Sessions[sid] = session
	if err := SaveAccountSessionsRecord(ctx, redisClient, rec); err != nil {
		return err
	}
	if err := redisClient.Set(ctx, sessionIndexKey(sid), acc, SessionTTL).Err(); err != nil {
		return fmt.Errorf("failed to store session index: %w", err)
	}
	return nil
}

func GetAccountIDBySessionID(ctx context.Context, redisClient *redis.Client, sessionID string) (string, error) {
	sid := strings.TrimSpace(sessionID)
	if sid == "" {
		return "", errors.New("session_id is required")
	}
	if redisClient == nil {
		return "", errors.New("redis client is nil")
	}
	v, err := redisClient.Get(ctx, sessionIndexKey(sid)).Result()
	if err == redis.Nil {
		return "", errors.New("session not found")
	}
	if err != nil {
		return "", fmt.Errorf("failed to resolve session index: %w", err)
	}
	return strings.TrimSpace(v), nil
}

func ResolveAccountSessionBySessionID(ctx context.Context, redisClient *redis.Client, sessionID string) (string, *AccountSession, error) {
	sid := strings.TrimSpace(sessionID)
	accountID, err := GetAccountIDBySessionID(ctx, redisClient, sid)
	if err != nil {
		return "", nil, err
	}
	rec, err := GetAccountSessionsRecord(ctx, redisClient, accountID)
	if err != nil {
		return "", nil, err
	}
	session, ok := rec.Sessions[sid]
	if !ok {
		return "", nil, errors.New("session not found")
	}
	return accountID, &session, nil
}

func RevokeAccountSession(ctx context.Context, redisClient *redis.Client, accountID, sessionID string) error {
	acc := strings.TrimSpace(accountID)
	sid := strings.TrimSpace(sessionID)
	if acc == "" || sid == "" {
		return nil
	}
	rec, err := GetAccountSessionsRecord(ctx, redisClient, acc)
	if err != nil {
		return err
	}
	delete(rec.Sessions, sid)
	if err := SaveAccountSessionsRecord(ctx, redisClient, rec); err != nil {
		return err
	}
	_ = redisClient.Del(ctx, sessionIndexKey(sid)).Err()
	return nil
}

func TouchAccountSession(ctx context.Context, redisClient *redis.Client, accountID, sessionID, appVersion string) error {
	acc := strings.TrimSpace(accountID)
	sid := strings.TrimSpace(sessionID)
	if acc == "" || sid == "" {
		return errors.New("account_id and session_id are required")
	}
	rec, err := GetAccountSessionsRecord(ctx, redisClient, acc)
	if err != nil {
		return err
	}
	session, ok := rec.Sessions[sid]
	if !ok {
		return errors.New("session not found")
	}
	session.LastSeenAt = time.Now().UTC()
	if strings.TrimSpace(appVersion) != "" {
		session.AppVersion = strings.TrimSpace(appVersion)
	}
	session.Grants = rec.Grants
	rec.Sessions[sid] = session
	return SaveAccountSessionsRecord(ctx, redisClient, rec)
}

func UpdateAccountSessionGrants(ctx context.Context, redisClient *redis.Client, accountID string, corpIDs, allianceIDs []int64) error {
	rec, err := GetAccountSessionsRecord(ctx, redisClient, accountID)
	if err != nil {
		return err
	}
	nextGrants := SessionGrants{
		CorporationIDs: normalizeIDs(corpIDs),
		AllianceIDs:    normalizeIDs(allianceIDs),
	}
	rec.Grants = nextGrants
	rec.GrantsVersion++
	for sid, session := range rec.Sessions {
		session.Grants = nextGrants
		rec.Sessions[sid] = session
	}
	return SaveAccountSessionsRecord(ctx, redisClient, rec)
}
