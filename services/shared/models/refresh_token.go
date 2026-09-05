package models

import (
	"errors"
	"fmt"
	"strings"

	"eve-industry-planner/shared/crypto/aesgcm"
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
	// CloudMaintRefreshFailures counts consecutive failed cloud-maintenance SSO refreshes for this row.
	// Reset on success. At 2 the row is removed. OAuth invalid_grant removes the row immediately.
	CloudMaintRefreshFailures int `bson:"cloudMaintRefreshFailures,omitempty" json:"cloudMaintRefreshFailures,omitempty"`
}

// PlainRefreshMaterial returns the refresh token plaintext, preferring encrypted-at-rest fields
// and falling back to legacy rToken during migration.
func (r *RefreshToken) PlainRefreshMaterial(kr *aesgcm.Keyring) (string, error) {
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
func (r *RefreshToken) EncryptRefreshAtRest(plaintext string, kr *aesgcm.Keyring) error {
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
	r.TokenFormatVersion = aesgcm.CiphertextFormatVersion
	r.RToken = ""
	return nil
}

// ReencryptTowardActiveVersion re-wraps toward the keyring active version (kr.NormalizedActiveVersion).
// Uses Keyring.RotateToActive for full ciphertext rows; otherwise PlainRefreshMaterial + EncryptRefreshAtRest.
//
// If skipUntagged is true, rows with no stored key version are left unchanged (cloud ESI maintenance).
// If false, legacy plaintext-only rows are encrypted too (dedicated key-rotation tasks).
func (r *RefreshToken) ReencryptTowardActiveVersion(kr *aesgcm.Keyring, skipUntagged bool) (didRotate bool, err error) {
	if kr == nil {
		return false, errors.New("refresh token keyring is nil")
	}
	if r == nil {
		return false, errors.New("refresh token row is nil")
	}
	activeVersion := kr.NormalizedActiveVersion()
	v := strings.TrimSpace(r.RTokenKeyVersion)
	if skipUntagged {
		if v == "" || v == activeVersion {
			return false, nil
		}
	} else if v == activeVersion {
		return false, nil
	}

	if r.RTokenCiphertext != "" && r.RTokenNonce != "" && r.RTokenKeyVersion != "" {
		nn, ct, ver, rotated, err := kr.RotateToActive(r.RTokenCiphertext, r.RTokenNonce, r.RTokenKeyVersion, []byte(r.CharacterHash))
		if err != nil {
			return false, err
		}
		if rotated {
			r.RTokenNonce = nn
			r.RTokenCiphertext = ct
			r.RTokenKeyVersion = ver
			r.TokenFormatVersion = aesgcm.CiphertextFormatVersion
			r.RToken = ""
		}
		return rotated, nil
	}

	plain, err := r.PlainRefreshMaterial(kr)
	if err != nil {
		return false, err
	}
	if err := r.EncryptRefreshAtRest(plain, kr); err != nil {
		return false, err
	}
	return true, nil
}
