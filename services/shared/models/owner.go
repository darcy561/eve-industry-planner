package models

import (
	"fmt"
	"strings"
)

// OwnerKind names what a stored document belongs to.
//
// A corporation is a peer of an account rather than a slice of one: it holds its
// own jobs and its own archive. Anything keyed on an owner therefore takes the
// kind alongside the id.
type OwnerKind string

const (
	OwnerAccount     OwnerKind = "account"
	OwnerPlanner     OwnerKind = "planner"
	OwnerCorporation OwnerKind = "corporation"
	OwnerAlliance    OwnerKind = "alliance"
)

// Owner addresses whatever a document belongs to.
//
// ID is whatever identifies the kind internally: an account id for an account, a
// minted id for a planner, and a ref for a corporation or alliance, which are
// never held as raw entity ids. Nothing here converts between the two.
//
// No JSON tags, deliberately. For the corporation and alliance kinds the ID is a
// ref, so a response serialising an owner directly would leak one; a response
// builds an owner handle explicitly instead, which turns a missed conversion into
// a compile error rather than a leak.
type Owner struct {
	Kind OwnerKind `bson:"kind"`
	ID   string    `bson:"id"`
}

// AccountOwner addresses what an account owns.
func AccountOwner(accountID string) Owner {
	return Owner{Kind: OwnerAccount, ID: accountID}
}

// Key identifies the owner in a single string, for a document id or a
// deduplication token.
func (o Owner) Key() string {
	return string(o.Kind) + ":" + o.ID
}

// ParseOwnerKey reads back what Key wrote.
//
// The id may itself contain a colon, so only the first separates kind from id.
func ParseOwnerKey(key string) (Owner, error) {
	kind, id, found := strings.Cut(key, ":")
	if !found {
		return Owner{}, fmt.Errorf("owner key %q must be kind:id", key)
	}
	owner := Owner{Kind: OwnerKind(kind), ID: id}
	if err := owner.Validate(); err != nil {
		return Owner{}, err
	}
	return owner, nil
}

// Validate reports whether the owner names something that can own a document.
//
// An unknown kind is refused rather than carried: a kind reaching storage that
// nothing knows how to read would key documents nothing can find again.
func (o Owner) Validate() error {
	switch o.Kind {
	case OwnerAccount, OwnerPlanner, OwnerCorporation, OwnerAlliance:
	default:
		return fmt.Errorf("unknown owner kind %q", o.Kind)
	}
	if strings.TrimSpace(o.ID) == "" {
		return fmt.Errorf("owner of kind %q needs an id", o.Kind)
	}
	return nil
}

// IsZero reports whether the owner is unset.
func (o Owner) IsZero() bool { return o == Owner{} }
