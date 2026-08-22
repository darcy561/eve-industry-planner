// Package protectedfields is the framework for converting entity ids on a
// document between the refs it stores and the raw ids a client sees.
//
// A document stores refs (shared/crypto/entityid) and never raw ids. Because a
// ref is deterministic, it is also the document's identity: it can be queried by
// deriving the ref for a known id, and compared across services. Because it is
// reversible, the response boundary can recover the raw id a client is owed.
//
// A document records the field set it was written under in its spec, so a
// backfill can select documents built under an older set rather than guessing
// from field presence.
package protectedfields

import (
	"fmt"

	"eve-industry-planner/shared/crypto/entityid"
)

// Spec versions a document type's protected field set. Bump it when the set of
// protected fields changes, so a backfill can select documents built under the
// older set rather than guessing from field presence.
type Spec string

const (
	// SpecJobFieldsV1 covers entity ids on a job's sale and linked-job lines.
	SpecJobFieldsV1 Spec = "jf1"
)

var knownSpecs = map[Spec]struct{}{
	SpecJobFieldsV1: {},
}

func known(spec Spec) bool {
	_, ok := knownSpecs[spec]
	return ok
}

// Kind is the entity a target names.
type Kind string

const (
	KindCharacter Kind = entityid.KindCharacter
	KindCorp      Kind = entityid.KindCorp
	KindAlliance  Kind = entityid.KindAlliance
)

// Target is one entity id on a document paired with the ref that stands in for
// it. ID is the client-facing value and is never persisted; Ref is what is
// stored.
type Target struct {
	Kind Kind
	ID   *int
	Ref  *string
}

// Declaration is a document type's protected field set: the spec it corresponds
// to, and how to reach every target on a document.
//
// Declaring targets in one place is the point of this package: encryption,
// decryption, clearing and detection all traverse the same declaration, so they
// cannot disagree about which fields hold entity ids.
type Declaration[T any] struct {
	Spec    Spec
	Targets func(doc *T) []Target
}

func encryptForKind(c *entityid.Cipher, kind Kind, id int) (string, error) {
	if !entityid.ValidKind(string(kind)) {
		return "", fmt.Errorf("unknown protected field kind %q", kind)
	}
	return c.Encrypt(string(kind), int64(id))
}

// Encrypt converts every populated id on doc into its ref and clears the id, so
// no raw value is persisted. Targets already carrying a ref are left alone,
// making this safe to re-run.
func Encrypt[T any](d Declaration[T], doc *T, c *entityid.Cipher) error {
	if doc == nil {
		return nil
	}
	if !known(d.Spec) {
		return fmt.Errorf("unknown spec %q", d.Spec)
	}
	if c == nil {
		return fmt.Errorf("entityid cipher is required")
	}

	for _, t := range d.Targets(doc) {
		if t.ID == nil || t.Ref == nil || *t.ID <= 0 {
			continue
		}
		if *t.Ref == "" {
			sealed, err := encryptForKind(c, t.Kind, *t.ID)
			if err != nil {
				return err
			}
			*t.Ref = sealed
		}
		*t.ID = 0
	}
	return nil
}

// Decrypt restores the raw id on every target carrying a ref, for the response
// boundary. The ref is left in place; it is suppressed on the wire by the model's
// json tags rather than by clearing it here, so a document decrypted for a
// response can still be written back unchanged.
func Decrypt[T any](d Declaration[T], doc *T, c *entityid.Cipher) error {
	if doc == nil {
		return nil
	}
	if c == nil {
		return fmt.Errorf("entityid cipher is required")
	}

	for _, t := range d.Targets(doc) {
		if t.ID == nil || t.Ref == nil || *t.Ref == "" {
			continue
		}
		id, err := c.DecryptKind(string(t.Kind), *t.Ref)
		if err != nil {
			return err
		}
		*t.ID = int(id)
	}
	return nil
}

// HasRawIDs reports whether any target still holds an id, which is the selection
// condition for a conversion backfill.
func HasRawIDs[T any](d Declaration[T], doc *T) bool {
	if doc == nil {
		return false
	}
	for _, t := range d.Targets(doc) {
		if t.ID != nil && *t.ID > 0 {
			return true
		}
	}
	return false
}

// ValuesForIDs converts ids a caller already holds into their refs, for building
// a query filter or matching against stored documents.
func ValuesForIDs(c *entityid.Cipher, kind Kind, ids []int) (map[int]string, error) {
	if c == nil {
		return nil, fmt.Errorf("entityid cipher is required")
	}
	out := make(map[int]string, len(ids))
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, done := out[id]; done {
			continue
		}
		sealed, err := encryptForKind(c, kind, id)
		if err != nil {
			return nil, err
		}
		out[id] = sealed
	}
	return out, nil
}

// ValuesForIDs64 is ValuesForIDs for ids arriving from ESI, which are int64.
func ValuesForIDs64(c *entityid.Cipher, kind Kind, ids []int64) (map[int64]string, error) {
	if c == nil {
		return nil, fmt.Errorf("entityid cipher is required")
	}
	out := make(map[int64]string, len(ids))
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, done := out[id]; done {
			continue
		}
		sealed, err := encryptForKind(c, kind, int(id))
		if err != nil {
			return nil, err
		}
		out[id] = sealed
	}
	return out, nil
}
