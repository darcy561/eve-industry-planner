// Package entityid converts raw EVE entity ids to and from an encrypted form
// that is safe to persist, log, and use as identity.
//
// The encrypted form is deterministic: the same (kind, id) always produces the
// same value, so it can be queried by encrypting a known id, and compared across
// services as an aggregation key, lock partition, or tenant key. It is also
// reversible, so the response boundary can recover the raw id it must return to
// a client.
//
// Determinism comes from deriving the AES-GCM nonce from the id rather than at
// random, the construction SIV mode formalises (RFC 5297, RFC 8452). Reusing a
// nonce is only unsafe across differing plaintexts under one key; here the nonce
// is a function of the plaintext, so a repeat always accompanies the identical
// plaintext.
package entityid

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"

	"eve-industry-planner/shared/core/swarmsecret"
)

// Kinds an encrypted value may name. The kind is bound into both the nonce and
// the AEAD's additional data, so one numeric id cannot collide across kinds and
// a value cannot be reinterpreted as another kind.
const (
	KindCharacter = "char"
	KindCorp      = "corp"
	KindAlliance  = "alliance"
)

// minSecretBytes is the shortest operator secret accepted.
const minSecretBytes = 16

// idBytes is the fixed plaintext width: one big-endian int64.
const idBytes = 8

// EnvKey names the operator secret both subkeys are derived from.
const EnvKey = "ENTITY_ID_KEY"

// Cipher encrypts and decrypts entity ids.
type Cipher struct {
	aead     cipher.AEAD
	nonceKey []byte
}

// New builds a Cipher from an operator secret of any length at or above
// minSecretBytes. The encryption and nonce-derivation subkeys are derived from
// it under distinct labels so neither can be computed from the other.
func New(secret []byte) (*Cipher, error) {
	if len(secret) < minSecretBytes {
		return nil, fmt.Errorf("entity id key must be at least %d bytes", minSecretBytes)
	}

	dataKey := subkey("data", secret)
	block, err := aes.NewCipher(dataKey[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceKey := subkey("nonce", secret)

	return &Cipher{aead: aead, nonceKey: nonceKey[:]}, nil
}

// NewFromEnv builds a Cipher from ENTITY_ID_KEY, resolved from env or
// /run/secrets (see [swarmsecret.Require]).
func NewFromEnv() (*Cipher, error) {
	secret, err := swarmsecret.Require(EnvKey)
	if err != nil {
		return nil, err
	}
	return New([]byte(strings.TrimSpace(secret)))
}

func subkey(label string, secret []byte) [32]byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte("entityid:" + label))
	return [32]byte(mac.Sum(nil))
}

// Character encrypts an EVE character id.
func (c *Cipher) Character(id int64) (string, error) { return c.Encrypt(KindCharacter, id) }

// Corporation encrypts an EVE corporation id.
func (c *Cipher) Corporation(id int64) (string, error) { return c.Encrypt(KindCorp, id) }

// Alliance encrypts an EVE alliance id.
func (c *Cipher) Alliance(id int64) (string, error) { return c.Encrypt(KindAlliance, id) }

// Encrypt returns "{kind}_{token}" for id, where token carries the derived nonce
// followed by the AES-GCM ciphertext.
func (c *Cipher) Encrypt(kind string, id int64) (string, error) {
	if c == nil {
		return "", errors.New("entityid cipher is nil")
	}
	if !ValidKind(kind) {
		return "", fmt.Errorf("unknown entity kind %q", kind)
	}
	if id <= 0 {
		return "", errors.New("id must be > 0")
	}

	plaintext := make([]byte, idBytes)
	binary.BigEndian.PutUint64(plaintext, uint64(id))

	nonce := c.nonce(kind, plaintext)
	token := make([]byte, 0, len(nonce)+len(plaintext)+c.aead.Overhead())
	token = append(token, nonce...)
	token = c.aead.Seal(token, nonce, plaintext, []byte(kind))

	return kind + "_" + base64.RawURLEncoding.EncodeToString(token), nil
}

// Decrypt recovers the kind and raw id from an encrypted value.
func (c *Cipher) Decrypt(value string) (kind string, id int64, err error) {
	if c == nil {
		return "", 0, errors.New("entityid cipher is nil")
	}
	kind, token, ok := split(value)
	if !ok {
		return "", 0, fmt.Errorf("malformed entity value")
	}
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return "", 0, fmt.Errorf("malformed entity value token: %w", err)
	}
	nonceSize := c.aead.NonceSize()
	if len(raw) < nonceSize+c.aead.Overhead()+idBytes {
		return "", 0, errors.New("entity value token is too short")
	}

	nonce, sealed := raw[:nonceSize], raw[nonceSize:]
	plaintext, err := c.aead.Open(nil, nonce, sealed, []byte(kind))
	if err != nil {
		return "", 0, fmt.Errorf("entity value does not decrypt: %w", err)
	}
	if len(plaintext) != idBytes {
		return "", 0, errors.New("entity value plaintext is the wrong width")
	}

	// The nonce must be the one this id derives, or the value was assembled from
	// parts rather than produced by Encrypt. GCM authenticates the ciphertext
	// against the nonce; this binds the nonce to the plaintext, which is what
	// makes the mapping one-to-one.
	if subtle.ConstantTimeCompare(nonce, c.nonce(kind, plaintext)) != 1 {
		return "", 0, errors.New("entity value nonce does not match its id")
	}

	return kind, int64(binary.BigEndian.Uint64(plaintext)), nil
}

// DecryptKind recovers the raw id and rejects a value that is not of want.
func (c *Cipher) DecryptKind(want, value string) (int64, error) {
	kind, id, err := c.Decrypt(value)
	if err != nil {
		return 0, err
	}
	if kind != want {
		return 0, fmt.Errorf("entity value is %q, want %q", kind, want)
	}
	return id, nil
}

// nonce derives the per-id nonce. Distinct from the encryption key, so seeing a
// nonce reveals nothing about the ciphertext's key.
func (c *Cipher) nonce(kind string, plaintext []byte) []byte {
	mac := hmac.New(sha256.New, c.nonceKey)
	mac.Write([]byte(kind))
	mac.Write([]byte{':'})
	mac.Write(plaintext)
	return mac.Sum(nil)[:c.aead.NonceSize()]
}

// ValidKind reports whether kind names an entity kind.
func ValidKind(kind string) bool {
	switch kind {
	case KindCharacter, KindCorp, KindAlliance:
		return true
	default:
		return false
	}
}

// ParseKind returns the entity kind a value names, reporting whether the value
// is well formed. It does not decrypt, so it needs no key.
func ParseKind(value string) (kind string, ok bool) {
	kind, _, ok = split(value)
	return kind, ok
}

// ValidShape reports whether a value is well formed and its token holds only
// base64url characters. It does not decrypt, so it needs no key.
func ValidShape(value string) bool {
	_, token, ok := split(value)
	if !ok {
		return false
	}
	for _, r := range token {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-' || r == '_':
		default:
			return false
		}
	}
	return true
}

func split(value string) (kind, token string, ok bool) {
	kind, token, found := strings.Cut(strings.TrimSpace(value), "_")
	if !found || token == "" || !ValidKind(kind) {
		return "", "", false
	}
	return kind, token, true
}
