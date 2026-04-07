package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
)

const (
	// DefaultAutoGeneratePath is the default path where auto-generated JWT private keys are stored
	DefaultAutoGeneratePath = "/data/jwt-private-key.pem"
	// DefaultKeyIDPath is the default path where the key ID (kid) is stored alongside the private key
	DefaultKeyIDPath = "/data/jwt-key-id.txt"
)

// GenerateRSAPrivateKey generates a new 2048-bit RSA private key
func GenerateRSAPrivateKey() (*rsa.PrivateKey, error) {
	return rsa.GenerateKey(rand.Reader, 2048)
}

// GenerateKeyID generates a new key ID for the private key
// Format: key-<uuid> to ensure uniqueness and security
// Falls back to timestamp if UUID generation fails
func GenerateKeyID() (string, error) {
	// Generate a random UUID v4
	u, err := uuid.NewRandom()
	if err != nil {
		// Fallback to timestamp if UUID generation fails
		return fmt.Sprintf("key-%d", time.Now().Unix()), nil
	}

	return fmt.Sprintf("key-%s", u.String()), nil
}

// LoadKeyID loads the key ID from file or environment variable
// Priority: 1) Persistent file, 2) Environment variable, 3) Generate new ID
// If env var is provided, it's saved to file for persistence
func LoadKeyID(cfg config.Config) (string, error) {
	keyIDPath := DefaultKeyIDPath
	envKeyID := os.Getenv("JWT_KEY_ID")
	fileExists := false
	var fileKeyID string

	// Check if key ID file exists
	if keyIDPath != "" {
		if data, err := os.ReadFile(keyIDPath); err == nil {
			fileExists = true
			fileKeyID = strings.TrimSpace(string(data))
		}
	}

	if fileExists && envKeyID != "" {
		// Both exist: compare and use env var if different (env var is authoritative for key rotation)
		if fileKeyID != envKeyID {
			// Key IDs are different, replace file with env var (key rotation)
			logs.InfoCtx(context.Background(), "JWT key ID from environment differs from file. Replacing file with environment key ID.",
				"file", keyIDPath,
				"old_id", fileKeyID,
				"new_id", envKeyID,
				"reason", "Environment variable is authoritative for key rotation")

			if err := os.WriteFile(keyIDPath, []byte(envKeyID), 0600); err != nil {
				logs.WarnCtx(context.Background(), "Failed to update key ID file with environment key ID", "error", err, "file", keyIDPath)
				// Continue with file key ID since we couldn't update it
				return fileKeyID, nil
			}
			return envKeyID, nil
		}
		// Key IDs match, use file (persistent source)
		return fileKeyID, nil
	} else if fileExists {
		// Only file exists, use it
		return fileKeyID, nil
	} else if envKeyID != "" {
		// Only env var exists, use it and save to file
		if keyIDPath != "" {
			if err := os.WriteFile(keyIDPath, []byte(envKeyID), 0600); err != nil {
				logs.WarnCtx(context.Background(), "Failed to save key ID from environment to file", "error", err, "file", keyIDPath)
			} else {
				logs.InfoCtx(context.Background(), "Saved key ID from environment variable to file for persistence", "file", keyIDPath, "key_id", envKeyID)
			}
		}
		return envKeyID, nil
	} else {
		// No file and no env var, generate new key ID
		if keyIDPath == "" {
			// Fallback to default if path not configured
			return "default-key-id", nil
		}

		// Generate new key ID
		newKeyID, err := GenerateKeyID()
		if err != nil {
			return "", fmt.Errorf("failed to generate key ID: %w", err)
		}
		logs.InfoCtx(context.Background(), "No JWT key ID found. Auto-generating new key ID.", "key_id_path", keyIDPath, "key_id", newKeyID)

		// Save to file
		if err := os.WriteFile(keyIDPath, []byte(newKeyID), 0600); err != nil {
			logs.WarnCtx(context.Background(), "Failed to save generated key ID to file", "error", err, "file", keyIDPath)
			// Return generated ID anyway
			return newKeyID, nil
		}

		logs.InfoCtx(context.Background(), "Successfully generated and saved key ID", "key_id_path", keyIDPath, "key_id", newKeyID)
		return newKeyID, nil
	}
}

// SaveKeyID saves a key ID to the persistent file
func SaveKeyID(keyID, filePath string) error {
	// Ensure directory exists
	dir := filepath.Dir(filePath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("failed to create directory: %w", err)
		}
	}

	// Write to file with restrictive permissions (owner read/write only)
	if err := os.WriteFile(filePath, []byte(keyID), 0600); err != nil {
		return fmt.Errorf("failed to write key ID file: %w", err)
	}

	return nil
}

// SaveRSAPrivateKey saves an RSA private key to a PEM file (PKCS#8 format)
func SaveRSAPrivateKey(key *rsa.PrivateKey, filePath string) error {
	// Ensure directory exists
	dir := filepath.Dir(filePath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("failed to create directory: %w", err)
		}
	}

	// Encode to PKCS#8 format
	keyBytes, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return fmt.Errorf("failed to marshal private key: %w", err)
	}

	// Create PEM block
	block := &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: keyBytes,
	}

	// Write to file with restrictive permissions (owner read/write only)
	file, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to create key file: %w", err)
	}
	defer file.Close()

	if err := pem.Encode(file, block); err != nil {
		return fmt.Errorf("failed to encode PEM: %w", err)
	}

	return nil
}

// LoadRSAPrivateKey loads an RSA private key with the following priority:
// 1. If both file and env var exist: compare them, replace file if different (env var is authoritative for key rotation)
// 2. If only file exists: use it (persistent state)
// 3. If only env var exists: use it and save to file for persistence
// 4. If neither exists: generate new key and save to file
//
// This function is called on first request (lazy loading), not on service start.
// If env var is set and differs from file, the file is updated to match env var.
// This allows key rotation by updating the environment variable.
// Supports both PKCS#1 and PKCS#8 formats
func LoadRSAPrivateKey() (*rsa.PrivateKey, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, err
	}
	autoGeneratePath := DefaultAutoGeneratePath
	var keyData []byte
	var keySource string

	// Check both file and env var to handle key rotation
	envKey := os.Getenv(cfg.JWTPrivateKeyEnvVar)
	fileExists := false
	var fileKeyData []byte

	if autoGeneratePath != "" {
		if _, err := os.Stat(autoGeneratePath); err == nil {
			fileExists = true
			fileKeyData, err = os.ReadFile(autoGeneratePath)
			if err != nil {
				return nil, fmt.Errorf("failed to read private key file: %w", err)
			}
		}
	}

	if fileExists && envKey != "" {
		// Both exist: compare and use env var if different (env var is authoritative for key rotation)
		envKeyHash := sha256.Sum256([]byte(envKey))
		fileKeyHash := sha256.Sum256(fileKeyData)

		if hex.EncodeToString(envKeyHash[:]) != hex.EncodeToString(fileKeyHash[:]) {
			// Keys are different, replace file with env var (key rotation)
			logs.InfoCtx(context.Background(), "JWT private key from environment differs from file. Replacing file with environment key.",
				"file", autoGeneratePath,
				"reason", "Environment variable is authoritative for key rotation")

			if err := os.WriteFile(autoGeneratePath, []byte(envKey), 0600); err != nil {
				logs.WarnCtx(context.Background(), "Failed to update key file with environment key", "error", err, "file", autoGeneratePath)
				// Continue with file key since we couldn't update it
				keyData = fileKeyData
				keySource = "persistent file (update failed)"
			} else {
				keyData = []byte(envKey)
				keySource = "environment variable (replaced file)"
			}
		} else {
			// Keys match, use file (persistent source)
			keyData = fileKeyData
			keySource = "persistent file"
		}
	} else if fileExists {
		// Only file exists, use it
		keyData = fileKeyData
		keySource = "persistent file"
	} else if envKey != "" {
		// Only env var exists, use it and save to file
		keyData = []byte(envKey)
		keySource = "environment variable"

		// Save env var to file for persistence
		if autoGeneratePath != "" {
			if err := os.WriteFile(autoGeneratePath, []byte(envKey), 0600); err != nil {
				logs.WarnCtx(context.Background(), "Failed to save key from environment to file", "error", err, "file", autoGeneratePath)
			} else {
				logs.InfoCtx(context.Background(), "Saved key from environment variable to file for persistence", "file", autoGeneratePath)
			}
		}
	} else {
		// No file and no env var, generate new key
		// Priority 4: Generate new key and save it
		// Use file locking to prevent race conditions in multi-instance deployments
		if autoGeneratePath == "" {
			return nil, fmt.Errorf("cannot generate key: auto-generate path not configured")
		}

		lockFile := autoGeneratePath + ".lock"
		lockFd, err := os.OpenFile(lockFile, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0600)
		if err != nil {
			// Another instance is generating the key, wait and retry
			if os.IsExist(err) {
				// Wait a moment for the other instance to finish
				time.Sleep(100 * time.Millisecond)
				// Retry reading the key file
				if _, err := os.Stat(autoGeneratePath); err == nil {
					keyData, err = os.ReadFile(autoGeneratePath)
					if err != nil {
						return nil, fmt.Errorf("failed to read auto-generated key after wait: %w", err)
					}
					keySource = "auto-generated file (after wait)"
					// Continue to decode below
				} else {
					return nil, fmt.Errorf("key generation in progress by another instance, but key file not found after wait")
				}
			} else {
				return nil, fmt.Errorf("failed to create lock file: %w", err)
			}
		} else {
			defer func() {
				lockFd.Close()
				os.Remove(lockFile)
			}()

			// Double-check key wasn't created while we waited for lock
			if _, err := os.Stat(autoGeneratePath); err == nil {
				// Key exists now, use it
				keyData, err = os.ReadFile(autoGeneratePath)
				if err != nil {
					return nil, fmt.Errorf("failed to read auto-generated key: %w", err)
				}
				keySource = "auto-generated file (after lock)"
				// Continue to decode below
			} else {
				// We hold the lock, generate the key
				logs.InfoCtx(context.Background(), "No JWT private key found. Auto-generating RSA private key for JWT signing.",
					"key_path", autoGeneratePath,
					"note", "For production deployments, provide your own key via JWT_PRIVATE_KEY environment variable")

				key, err := GenerateRSAPrivateKey()
				if err != nil {
					return nil, fmt.Errorf("failed to generate RSA key: %w", err)
				}

				// Save to file
				if err := SaveRSAPrivateKey(key, autoGeneratePath); err != nil {
					return nil, fmt.Errorf("failed to save generated key: %w", err)
				}

				// Also generate and save a new key ID when generating a new key
				// LoadKeyID will auto-generate if not found
				_, err = LoadKeyID(cfg)
				if err != nil {
					logs.WarnCtx(context.Background(), "Failed to load/generate key ID when generating new key", "error", err)
				}

				logs.InfoCtx(context.Background(), "Successfully generated and saved RSA private key", "key_path", autoGeneratePath)

				return key, nil
			}
		}
	}

	if keySource != "" {
		logs.DebugCtx(context.Background(), "Loaded RSA private key", "source", keySource)
	}

	// Decode PEM block
	block, _ := pem.Decode(keyData)
	if block == nil {
		return nil, errors.New("failed to decode PEM block containing private key")
	}

	// Try PKCS#1 format first
	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err == nil {
		return privateKey, nil
	}

	// Try PKCS#8 format
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key (tried PKCS#1 and PKCS#8): %w", err)
	}

	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not an RSA key")
	}

	return rsaKey, nil
}

// GetPublicKeyJWK converts an RSA public key to JWK format for exposing via JWKS endpoint
func GetPublicKeyJWK(privateKey *rsa.PrivateKey, kid string) (map[string]interface{}, error) {
	publicKey := &privateKey.PublicKey

	// Convert modulus (N) to base64url-encoded bytes
	nBytes := publicKey.N.Bytes()
	// Ensure we have the correct byte length (pad if needed for key size)
	keySize := (publicKey.N.BitLen() + 7) / 8
	if len(nBytes) < keySize {
		padded := make([]byte, keySize)
		copy(padded[keySize-len(nBytes):], nBytes)
		nBytes = padded
	}
	nBase64 := base64.RawURLEncoding.EncodeToString(nBytes)

	// Convert exponent (E) to base64url-encoded bytes
	// RSA exponents are typically 65537 (0x10001) or 3, so we need at most 4 bytes
	e := publicKey.E
	var eBytes []byte
	if e <= 255 {
		eBytes = []byte{byte(e)}
	} else if e <= 65535 {
		eBytes = make([]byte, 2)
		binary.BigEndian.PutUint16(eBytes, uint16(e))
	} else {
		eBytes = make([]byte, 4)
		binary.BigEndian.PutUint32(eBytes, uint32(e))
	}
	// Remove leading zeros
	start := 0
	for start < len(eBytes) && eBytes[start] == 0 {
		start++
	}
	if start < len(eBytes) {
		eBytes = eBytes[start:]
	}
	eBase64 := base64.RawURLEncoding.EncodeToString(eBytes)

	return map[string]interface{}{
		"kty": "RSA",
		"kid": kid,
		"use": "sig",
		"alg": "RS256",
		"n":   nBase64,
		"e":   eBase64,
	}, nil
}

// GenerateRS256JWKS returns a JWKS (JSON Web Key Set) response for the public key
func GenerateRS256JWKS(privateKey *rsa.PrivateKey, kid string) ([]byte, error) {
	jwk, err := GetPublicKeyJWK(privateKey, kid)
	if err != nil {
		return nil, err
	}

	jwks := map[string]interface{}{
		"keys": []map[string]interface{}{jwk},
	}

	return json.Marshal(jwks)
}
