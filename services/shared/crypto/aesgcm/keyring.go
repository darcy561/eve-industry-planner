// Package aesgcm provides reusable AES-GCM keyring encryption utilities.
package aesgcm

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

// CiphertextFormatVersion is bumped when envelope layout or semantics change.
const CiphertextFormatVersion = 1

// Keyring holds the active encryption key and optional legacy keys for decrypt.
type Keyring struct {
	activeVersion string
	activeKey     []byte
	legacyKeys    map[string][]byte // version -> key material (same length as active)
}

// NewKeyring builds a keyring from the active key version and raw key bytes (AES-128/192/256).
func NewKeyring(activeVersion string, activeKey []byte, legacy map[string][]byte) (*Keyring, error) {
	if activeVersion == "" {
		return nil, errors.New("key version is required")
	}
	if len(activeKey) != 16 && len(activeKey) != 24 && len(activeKey) != 32 {
		return nil, fmt.Errorf("AES key must be 16, 24, or 32 bytes, got %d", len(activeKey))
	}
	kr := &Keyring{
		activeVersion: activeVersion,
		activeKey:     append([]byte(nil), activeKey...),
		legacyKeys:    map[string][]byte{},
	}
	for v, b := range legacy {
		if v == "" || len(b) == 0 {
			continue
		}
		if len(b) != len(activeKey) {
			return nil, fmt.Errorf("legacy key %q length %d must match active key length %d", v, len(b), len(activeKey))
		}
		kr.legacyKeys[v] = append([]byte(nil), b...)
	}
	return kr, nil
}

// ActiveVersion returns the label used for new ciphertext (Encrypt output).
func (k *Keyring) ActiveVersion() string {
	if k == nil {
		return ""
	}
	return k.activeVersion
}

// NormalizedActiveVersion returns ActiveVersion trimmed, or "v1" when unset (matches envelope defaults).
func (k *Keyring) NormalizedActiveVersion() string {
	if k == nil {
		return "v1"
	}
	v := strings.TrimSpace(k.activeVersion)
	if v == "" {
		return "v1"
	}
	return v
}

func (k *Keyring) keyForVersion(version string) ([]byte, error) {
	if version == k.activeVersion {
		return k.activeKey, nil
	}
	if b, ok := k.legacyKeys[version]; ok {
		return b, nil
	}
	return nil, fmt.Errorf("unknown key version %q", version)
}

// Encrypt seals plaintext with AES-GCM. aad binds the ciphertext to caller context.
func (k *Keyring) Encrypt(plaintext string, aad []byte) (nonceB64, ciphertextB64 string, keyVersion string, err error) {
	block, err := aes.NewCipher(k.activeKey)
	if err != nil {
		return "", "", "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", "", err
	}
	sealed := gcm.Seal(nil, nonce, []byte(plaintext), aad)
	return base64.StdEncoding.EncodeToString(nonce),
		base64.StdEncoding.EncodeToString(sealed),
		k.activeVersion,
		nil
}

// Decrypt opens ciphertext using the recorded key version. aad must match Encrypt.
func (k *Keyring) Decrypt(ciphertextB64, nonceB64, keyVersion string, aad []byte) (string, error) {
	ct, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return "", fmt.Errorf("ciphertext base64: %w", err)
	}
	nonce, err := base64.StdEncoding.DecodeString(nonceB64)
	if err != nil {
		return "", fmt.Errorf("nonce base64: %w", err)
	}
	key, err := k.keyForVersion(keyVersion)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(nonce) != gcm.NonceSize() {
		return "", fmt.Errorf("invalid nonce length %d", len(nonce))
	}
	pt, err := gcm.Open(nil, nonce, ct, aad)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}

// RotateToActive decrypts ciphertext sealed with keyVersion (active or legacy) and re-seals it with the active key.
// aad must match the value used for the original Encrypt. If keyVersion already matches the active version
// (after trimming whitespace), returns the inputs unchanged with didRotate false.
func (k *Keyring) RotateToActive(ciphertextB64, nonceB64, keyVersion string, aad []byte) (nonceOut, ciphertextOut, keyVersionOut string, didRotate bool, err error) {
	if k == nil {
		return "", "", "", false, errors.New("keyring is nil")
	}
	kv := strings.TrimSpace(keyVersion)
	if strings.TrimSpace(kv) == strings.TrimSpace(k.activeVersion) {
		return nonceB64, ciphertextB64, keyVersion, false, nil
	}
	plaintext, err := k.Decrypt(ciphertextB64, nonceB64, kv, aad)
	if err != nil {
		return "", "", "", false, err
	}
	nonceOut, ciphertextOut, keyVersionOut, err = k.Encrypt(plaintext, aad)
	if err != nil {
		return "", "", "", false, err
	}
	return nonceOut, ciphertextOut, keyVersionOut, true, nil
}
