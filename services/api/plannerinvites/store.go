package plannerinvites

import (
	"context"
	"errors"
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/models/planner"
	eipredis "eve-industry-planner/shared/redis"
)

// MaxPendingPerPlanner caps outstanding invites for one planner.
const MaxPendingPerPlanner = 25

// indexGrace keeps a planner's index alive past its last invite. Its entries are
// pruned by expiry regardless, so the margin costs a key rather than a wrong
// answer.
const indexGrace = time.Hour

// ErrTooManyInvites refuses an issue that would pass [MaxPendingPerPlanner].
var ErrTooManyInvites = fmt.Errorf("planner already has %d invites outstanding", MaxPendingPerPlanner)

// ErrInviteExists refuses an issue that would replace an invite already stored
// under that id, which would silently retire a credential somebody holds.
var ErrInviteExists = errors.New("an invite already exists under that id")

// Store reads and writes a planner's invites.
type Store struct{ redis *eipredis.Redis }

// New binds the store to a Redis handle.
func New(r *eipredis.Redis) *Store { return &Store{redis: r} }

// Issue stores an invite and indexes it against its planner.
func (s *Store) Issue(ctx context.Context, invite planner.Invite, now time.Time) error {
	if s == nil || s.redis == nil {
		return eipredis.ErrNoClient
	}
	if err := invite.Validate(); err != nil {
		return err
	}
	ttl := invite.ExpiresAt.Sub(now)
	if ttl <= 0 {
		return planner.ErrInviteExpired
	}

	outstanding, err := s.Pending(ctx, invite.PlannerID, now)
	if err != nil {
		return err
	}
	if len(outstanding) >= MaxPendingPerPlanner {
		return ErrTooManyInvites
	}

	encoded, err := jsoncodec.Marshal(invite)
	if err != nil {
		return fmt.Errorf("encode invite: %w", err)
	}
	// Written only if absent: replacing a record would retire a credential
	// somebody is holding without anything reporting that it had.
	stored, err := s.redis.PutIfAbsent(ctx, recordKey(invite.ID), string(encoded), ttl)
	if err != nil {
		return fmt.Errorf("store invite: %w", err)
	}
	if !stored {
		return ErrInviteExists
	}
	if err := s.redis.PutScored(ctx, plannerKey(invite.PlannerID), invite.ID,
		float64(invite.ExpiresAt.Unix()), ttl+indexGrace); err != nil {
		return fmt.Errorf("index invite: %w", err)
	}
	return nil
}

// Pending returns a planner's invites that have not expired.
//
// An entry whose record has gone is dropped from the index as it is found: the
// record's TTL is the authority, and the index is a list of what to look up.
func (s *Store) Pending(ctx context.Context, plannerID string, now time.Time) ([]planner.Invite, error) {
	if s == nil || s.redis == nil {
		return nil, eipredis.ErrNoClient
	}
	members, err := s.redis.Scored(ctx, plannerKey(plannerID))
	if err != nil {
		return nil, fmt.Errorf("read planner invites: %w", err)
	}

	invites := make([]planner.Invite, 0, len(members))
	var stale []string
	for _, member := range members {
		invite, err := s.Load(ctx, member.Member)
		if err != nil {
			if eipredis.IsNotFound(err) {
				stale = append(stale, member.Member)
				continue
			}
			return nil, err
		}
		if invite.PlannerID != plannerID || invite.Expired(now) {
			stale = append(stale, member.Member)
			continue
		}
		invites = append(invites, invite)
	}
	if len(stale) > 0 {
		if _, err := s.redis.RemoveScored(ctx, plannerKey(plannerID), stale...); err != nil {
			return nil, fmt.Errorf("prune planner invites: %w", err)
		}
	}
	return invites, nil
}

// Load reads one invite. A missing one reports [eipredis.ErrNotFound].
func (s *Store) Load(ctx context.Context, inviteID string) (planner.Invite, error) {
	if s == nil || s.redis == nil {
		return planner.Invite{}, eipredis.ErrNoClient
	}
	id := strings.TrimSpace(inviteID)
	if id == "" {
		return planner.Invite{}, planner.ErrInviteNotFound
	}
	var invite planner.Invite
	if err := s.redis.GetJSON(ctx, recordKey(id), &invite); err != nil {
		return planner.Invite{}, err
	}
	return invite, nil
}

// Revoke deletes an invite and forgets it. Revoking one that is already gone is
// not an error: the caller asked for the link to stop working.
func (s *Store) Revoke(ctx context.Context, plannerID, inviteID string) error {
	if s == nil || s.redis == nil {
		return eipredis.ErrNoClient
	}
	if _, err := s.redis.Delete(ctx, recordKey(inviteID)); err != nil {
		return fmt.Errorf("revoke invite: %w", err)
	}
	if _, err := s.redis.RemoveScored(ctx, plannerKey(plannerID), inviteID); err != nil {
		return fmt.Errorf("forget invite: %w", err)
	}
	return nil
}

// spendInviteScript checks an invite may be spent and increments its use count
// as one step. Two accounts redeeming a one-use invite at the same moment would
// otherwise both read uses=0, both write uses=1, and both be let in.
//
// Expiry is the key's own TTL rather than a check here: a record that has run
// out is not there to be read.
//
//	KEYS[1] = invite record key
//	ARGV[1] = redeeming accountID
//
// Answers the stored invite with Uses incremented, or "err:" and a reason.
var spendInviteScript = eipredis.Script(`
local raw = redis.call("GET", KEYS[1])
if not raw then
  return "err:not_found"
end
local invite = cjson.decode(raw)
local account = ARGV[1]

if invite.revokedAt ~= nil then
  return "err:revoked"
end
if invite.boundAccountID ~= nil and invite.boundAccountID ~= "" and invite.boundAccountID ~= account then
  return "err:bound"
end
local uses = invite.uses or 0
if invite.maxUses > 0 and uses >= invite.maxUses then
  return "err:spent"
end

invite.uses = uses + 1
local ttl = redis.call("TTL", KEYS[1])
local encoded = cjson.encode(invite)
if ttl and ttl > 0 then
  redis.call("SET", KEYS[1], encoded, "EX", ttl)
else
  redis.call("SET", KEYS[1], encoded)
end
return encoded
`)

// Spend consumes one use of an invite for accountID and returns it as stored.
//
// The token is proven before the script runs, so a wrong one cannot consume a
// use — which anyone holding the id could otherwise do until the invite was
// gone. Lua has no constant-time comparison to do it inside the script.
func (s *Store) Spend(ctx context.Context, inviteID, token, accountID string, now time.Time) (planner.Invite, error) {
	if s == nil || s.redis == nil {
		return planner.Invite{}, eipredis.ErrNoClient
	}
	presented, err := planner.HashInviteToken(token)
	if err != nil {
		return planner.Invite{}, err
	}

	stored, err := s.Load(ctx, inviteID)
	if err != nil {
		if eipredis.IsNotFound(err) {
			return planner.Invite{}, planner.ErrInviteNotFound
		}
		return planner.Invite{}, err
	}
	if !stored.TokenMatches(presented) {
		return planner.Invite{}, planner.ErrInviteToken
	}
	if err := stored.Redeemable(accountID, now); err != nil {
		return planner.Invite{}, err
	}

	raw, err := s.redis.Run(ctx, spendInviteScript, []string{recordKey(inviteID)}, accountID).Text()
	if err != nil {
		return planner.Invite{}, fmt.Errorf("spend invite: %w", err)
	}
	if refusal, refused := strings.CutPrefix(raw, "err:"); refused {
		return planner.Invite{}, refusalError(refusal)
	}

	var spent planner.Invite
	if err := jsoncodec.Unmarshal([]byte(raw), &spent); err != nil {
		return planner.Invite{}, fmt.Errorf("spend invite: decode: %w", err)
	}
	return spent, nil
}

// refusalError maps what the script answered onto the model's errors, so a
// caller branches on one set wherever the refusal was decided.
func refusalError(refusal string) error {
	switch refusal {
	case "not_found":
		return planner.ErrInviteNotFound
	case "revoked":
		return planner.ErrInviteRevoked
	case "spent":
		return planner.ErrInviteSpent
	case "bound":
		return planner.ErrInviteBound
	default:
		return fmt.Errorf("invite refused: %s", refusal)
	}
}
