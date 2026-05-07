package sealedfields

import (
	"encoding/json"
	"fmt"
	"strings"

	corecrypto "eve-industry-planner/shared/core/crypto"
)

// SealedFields is a reusable AES-GCM envelope for document-level field protection.
type SealedFields struct {
	CT             string   `bson:"ct" json:"ct"`
	Nonce          string   `bson:"nonce" json:"nonce"`
	KeyVersion     string   `bson:"kv" json:"kv"`
	Domain         string   `bson:"domain" json:"domain"`
	PayloadVersion int      `bson:"pv" json:"pv"`
	Fields         []string `bson:"fields" json:"fields"`
}

func aadFor(domain string, payloadVersion int) []byte {
	return []byte(fmt.Sprintf("%s:v%d", strings.TrimSpace(domain), payloadVersion))
}

// Seal encrypts plaintext JSON with domain/version bound AAD.
func Seal(keyring *corecrypto.Keyring, domain string, payloadVersion int, plaintextJSON []byte, fields []string) (*SealedFields, error) {
	if keyring == nil {
		return nil, fmt.Errorf("keyring is required")
	}
	domain = strings.TrimSpace(domain)
	if domain == "" {
		return nil, fmt.Errorf("domain is required")
	}
	if payloadVersion <= 0 {
		return nil, fmt.Errorf("payloadVersion must be > 0")
	}
	if len(plaintextJSON) == 0 {
		return nil, fmt.Errorf("plaintextJSON is required")
	}

	nonce, ciphertext, keyVersion, err := keyring.Encrypt(string(plaintextJSON), aadFor(domain, payloadVersion))
	if err != nil {
		return nil, err
	}

	out := &SealedFields{
		CT:             ciphertext,
		Nonce:          nonce,
		KeyVersion:     keyVersion,
		Domain:         domain,
		PayloadVersion: payloadVersion,
		Fields:         append([]string(nil), fields...),
	}
	return out, nil
}

// Open decrypts a sealed envelope and returns plaintext JSON bytes.
func Open(keyring *corecrypto.Keyring, sealed *SealedFields) ([]byte, error) {
	if keyring == nil {
		return nil, fmt.Errorf("keyring is required")
	}
	if sealed == nil {
		return nil, fmt.Errorf("sealed is required")
	}
	if strings.TrimSpace(sealed.Domain) == "" {
		return nil, fmt.Errorf("sealed domain is required")
	}
	if sealed.PayloadVersion <= 0 {
		return nil, fmt.Errorf("sealed payloadVersion must be > 0")
	}

	plaintext, err := keyring.Decrypt(
		sealed.CT,
		sealed.Nonce,
		strings.TrimSpace(sealed.KeyVersion),
		aadFor(sealed.Domain, sealed.PayloadVersion),
	)
	if err != nil {
		return nil, err
	}
	return []byte(plaintext), nil
}

// OpenAs decrypts and unmarshals the envelope into the requested payload type.
func OpenAs[T any](keyring *corecrypto.Keyring, sealed *SealedFields) (T, error) {
	var out T
	plaintext, err := Open(keyring, sealed)
	if err != nil {
		return out, err
	}
	if err := json.Unmarshal(plaintext, &out); err != nil {
		return out, err
	}
	return out, nil
}
