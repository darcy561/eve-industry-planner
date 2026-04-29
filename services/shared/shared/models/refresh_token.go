package models

import (
	"errors"
	"fmt"

	corecrypto "eve-industry-planner/shared/core/crypto"
)

// RefreshToken represents a refresh token for a character.
type RefreshToken struct {
	CharacterHash string `bson:"CharacterHash" json:"characterHash"`
	// RToken is legacy plaintext at rest (migration only). New writes must use encrypted fields.
	RToken             string `bson:"rToken,omitempty" json:"rToken,omitempty"`
	RTokenCiphertext   string `bson:"rTokenCiphertext,omitempty" json:"rTokenCiphertext,omitempty"`
	RTokenNonce        string `bson:"rTokenNonce,omitempty" json:"rTokenNonce,omitempty"`
	RTokenKeyVersion   string `bson:"rTokenKeyVersion,omitempty" json:"rTokenKeyVersion,omitempty"`
	TokenFormatVersion int    `bson:"tokenFormatVersion,omitempty" json:"tokenFormatVersion,omitempty"`
}

// PlainRefreshMaterial returns the refresh token plaintext, preferring encrypted-at-rest fields
// and falling back to legacy rToken during migration.
func (r *RefreshToken) PlainRefreshMaterial(kr *corecrypto.Keyring) (string, error) {
	if kr == nil {
		return "", errors.New("refresh token keyring is nil")
	}
	if r == nil {
		return "", errors.New("refresh token row is nil")
	}
	if r.RTokenCiphertext != "" && r.RTokenNonce != "" && r.RTokenKeyVersion != "" {
		return kr.Decrypt(r.RTokenCiphertext, r.RTokenNonce, r.RTokenKeyVersion, []byte(r.CharacterHash))
	}
	if r.RToken != "" {
		return r.RToken, nil
	}
	return "", errors.New("refresh token material missing")
}

// EncryptRefreshAtRest replaces legacy plaintext with AES-GCM ciphertext fields.
func (r *RefreshToken) EncryptRefreshAtRest(plaintext string, kr *corecrypto.Keyring) error {
	if kr == nil {
		return errors.New("refresh token keyring is nil")
	}
	if r == nil {
		return errors.New("refresh token row is nil")
	}
	if plaintext == "" {
		return errors.New("plaintext refresh token is empty")
	}
	if r.CharacterHash == "" {
		return errors.New("CharacterHash is required for refresh token encryption")
	}
	nonce, ct, ver, err := kr.Encrypt(plaintext, []byte(r.CharacterHash))
	if err != nil {
		return fmt.Errorf("encrypt refresh token: %w", err)
	}
	r.RTokenCiphertext = ct
	r.RTokenNonce = nonce
	r.RTokenKeyVersion = ver
	r.TokenFormatVersion = corecrypto.CiphertextFormatVersion
	r.RToken = ""
	return nil
}
