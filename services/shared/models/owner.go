package models

import (
	"fmt"
	"strings"
)

// StatsOwnerKind names what a set of build statistics belongs to.
//
// A corporation is a peer of an account rather than a slice of one: it holds its
// own jobs and its own archive. An alliance is expected to follow as a third
// kind, so anything keyed on an owner takes the kind alongside the id.
type StatsOwnerKind string

const (
	StatsOwnerAccount     StatsOwnerKind = "account"
	StatsOwnerCorporation StatsOwnerKind = "corporation"
	StatsOwnerAlliance    StatsOwnerKind = "alliance"
)

// StatsOwner addresses one set of build statistics.
//
// ID is whatever identifies the kind internally: an account id for an account,
// and a ref for a corporation or alliance, which are never held as raw entity
// ids. Nothing here converts between the two.
type StatsOwner struct {
	Kind StatsOwnerKind `bson:"kind" json:"kind"`
	ID   string         `bson:"id" json:"id"`
}

// AccountStatsOwner addresses an account's statistics.
func AccountStatsOwner(accountID string) StatsOwner {
	return StatsOwner{Kind: StatsOwnerAccount, ID: accountID}
}

// Key identifies the owner in a single string, for a document id or a
// deduplication token.
func (o StatsOwner) Key() string {
	return string(o.Kind) + ":" + o.ID
}

// ParseStatsOwnerKey reads back what Key wrote.
//
// The id may itself contain a colon, so only the first separates kind from id.
func ParseStatsOwnerKey(key string) (StatsOwner, error) {
	kind, id, found := strings.Cut(key, ":")
	if !found {
		return StatsOwner{}, fmt.Errorf("owner key %q must be kind:id", key)
	}
	owner := StatsOwner{Kind: StatsOwnerKind(kind), ID: id}
	if err := owner.Validate(); err != nil {
		return StatsOwner{}, err
	}
	return owner, nil
}

// Validate reports whether the owner names something that can hold statistics.
//
// An unknown kind is refused rather than carried: a kind reaching storage that
// nothing knows how to read would key documents nothing can find again.
func (o StatsOwner) Validate() error {
	switch o.Kind {
	case StatsOwnerAccount, StatsOwnerCorporation, StatsOwnerAlliance:
	default:
		return fmt.Errorf("unknown statistics owner kind %q", o.Kind)
	}
	if strings.TrimSpace(o.ID) == "" {
		return fmt.Errorf("statistics owner of kind %q needs an id", o.Kind)
	}
	return nil
}

// IsZero reports whether the owner is unset.
func (o StatsOwner) IsZero() bool { return o == StatsOwner{} }
