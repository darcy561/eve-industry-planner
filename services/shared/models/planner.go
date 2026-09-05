package models

import (
	"errors"
	"fmt"
	"time"
)

// AccountMeta is the `_meta` of a document owned by an account rather than held
// in a planner: the user document and application settings.
type AccountMeta struct {
	MetaData `bson:",inline" json:",inline"`
}

// PlannerScopedMeta is the `_meta` of a document held in a planner, where more
// than one account may write.
//
// LastUpdatedBy lives here rather than on the shared core because it only means
// something where more than one account can write: on an account-owned document
// it is always the owner, so carrying it there would be noise.
type PlannerScopedMeta struct {
	MetaData      `bson:",inline" json:",inline"`
	LastUpdatedBy string `bson:"lastUpdatedBy,omitempty" json:"lastUpdatedBy,omitempty"`
}

// PlannerMeta is a planner document's own `_meta`.
type PlannerMeta struct {
	MetaData `bson:",inline" json:",inline"`
}

// Planner is a working area that jobs, groups and their archive belong to.
//
// Its _id is the owner key, so the owner is stored once rather than beside a
// duplicate of itself — the pattern the rebuild queue already uses when it parses
// an owner out of a document id.
//
// An owner key is not serialisable to a client: for the corporation and alliance
// kinds it contains a ref. The id fields therefore carry `json:"-"`, and a
// response emits the owner handle instead, converting at the same last hop as
// every other ref.
type Planner struct {
	ID            string      `bson:"_id" json:"-"`
	SchemaVersion int         `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	Name          string      `bson:"name" json:"name"`
	MemberCount   int         `bson:"memberCount" json:"memberCount"`
	AccessModels  []string    `bson:"accessModels,omitempty" json:"accessModels,omitempty"`
	CreatedBy     string      `bson:"createdBy" json:"-"`
	MetaData      PlannerMeta `bson:"_meta" json:"_meta"`
}

// Owner reads the planner's owner back out of its id.
func (p Planner) Owner() (Owner, error) { return ParseOwnerKey(p.ID) }

// Shared reports whether more than one account is in the planner.
func (p Planner) Shared() bool { return p.MemberCount > 1 }

// PlannerMembership puts one account in one planner, and is the only thing that
// grants access to one: nothing above it asks how the row came to exist.
type PlannerMembership struct {
	ID            string     `bson:"_id" json:"-"`
	SchemaVersion int        `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	PlannerID     string     `bson:"plannerID" json:"-"`
	AccountID     string     `bson:"accountID" json:"-"`
	JoinedAt      time.Time  `bson:"joinedAt" json:"joinedAt"`
	JoinMethod    JoinMethod `bson:"joinMethod" json:"joinMethod"`
}

// JoinMethod is how an account came to be a member. The branch that is set is
// the method, and exactly one is populated.
//
// No tag beside the branch: a stored tag and a stored branch encode the same
// fact, and two copies of one fact can disagree.
type JoinMethod struct {
	Self   *SelfJoin   `bson:"self,omitempty" json:"self,omitempty"`
	Invite *InviteJoin `bson:"invite,omitempty" json:"invite,omitempty"`
	ESI    *ESIJoin    `bson:"esi,omitempty" json:"esi,omitempty"`
}

// Validate reports whether exactly one branch is set.
//
// Checked on write rather than made impossible by the type: Go has no sum type,
// and a struct of pointers is the shape that stores and queries cleanly.
func (j JoinMethod) Validate() error {
	set := 0
	for _, populated := range []bool{j.Self != nil, j.Invite != nil, j.ESI != nil} {
		if populated {
			set++
		}
	}
	switch set {
	case 1:
		return nil
	case 0:
		return errors.New("membership names no join method")
	default:
		return fmt.Errorf("membership names %d join methods, want exactly one", set)
	}
}

// SelfJoin is an account's own planner, which it did not join so much as have.
type SelfJoin struct{}

// InviteJoin records the invite an account came in on. None of it leaves the
// server: who invited them is not the joiner's business to publish.
type InviteJoin struct {
	InvitedBy string    `bson:"invitedBy" json:"-"`
	IssuedAt  time.Time `bson:"issuedAt" json:"-"`
	InviteID  string    `bson:"inviteID,omitempty" json:"-"`
}

// ESIJoin records membership that follows an EVE entity rather than an invite.
type ESIJoin struct {
	EntityRef     string `bson:"entityRef" json:"-"`
	CharacterHash string `bson:"characterHash,omitempty" json:"-"`
}

// PlannerInvite is one outstanding invitation into a planner.
//
// The hash, the binding and the creator never leave the server. An invite grants
// membership and nothing more, so it carries no role.
//
// Invites are not kept: a TTL index on ExpiresAt clears expired ones, and one
// that is spent or revoked is deleted — what the membership needed from it was
// copied at join time.
type PlannerInvite struct {
	ID             string     `bson:"_id" json:"id"`
	SchemaVersion  int        `bson:"schemaVersion,omitempty" json:"schemaVersion,omitempty"`
	PlannerID      string     `bson:"plannerID" json:"-"`
	TokenHash      []byte     `bson:"tokenHash" json:"-"`
	BoundAccountID string     `bson:"boundAccountID,omitempty" json:"-"`
	MaxUses        int        `bson:"maxUses" json:"maxUses"`
	Uses           int        `bson:"uses" json:"uses"`
	ExpiresAt      time.Time  `bson:"expiresAt" json:"expiresAt"`
	RevokedAt      *time.Time `bson:"revokedAt,omitempty" json:"revokedAt,omitempty"`
	CreatedBy      string     `bson:"createdBy" json:"-"`
}

// SessionGrants is every owner a session may read, including the account's own
// key, so nothing downstream special-cases the account.
//
// It lives in Redis and expires, so its shape rolls out rather than migrating —
// which is why it carries no schema version.
type SessionGrants struct {
	OwnerKeys []string `json:"owner_keys"`
}
