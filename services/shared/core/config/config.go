package config

import (
	"errors"
	"net/url"
	"os"
	"strings"

	corecrypto "eve-industry-planner/shared/core/crypto"
	"eve-industry-planner/shared/core/crypto/keyrings"
)

type Config struct {
	MONGO_URL                 string
	WS_URL                    string
	NATS_URL                  string
	REDIS_URL                 string
	MINIO_URL                 string
	API_PORT                  string
	WS_PORT                   string
	AuthSecret                string
	JWTPrivateKeyEnvVar       string // Environment variable name containing the RSA private key (e.g., "JWT_PRIVATE_KEY")
	JWTKeyID                  string // Key ID for JWKS (kid)
	ExternalJWTSecret         string
	ExternalJWTIssuer         string
	ExternalJWTAudience       string
	EveSSOClientID            string
	EveSSOClientSecret        string
	FeedbackDiscordWebhookURL string
	// RefreshTokenKeyring encrypts persisted cloud additional-character ESI refresh tokens (AES-GCM).
	RefreshTokenKeyring *corecrypto.Keyring `json:"-"`
	// Refresh token key metadata derived from keyring config.
	RefreshTokenActiveVersion     string              `json:"-"`
	RefreshTokenSupportedVersions map[string]struct{} `json:"-"`
}

// MongoURLFromEnv returns the MongoDB connection URI from environment variables.
// If MONGO_URL is non-empty, it is returned as-is.
// Otherwise MONGO_USERNAME and MONGO_PASSWORD are required and the standard
// eve_industry_planner URI is built (same shape as [LoadConfig]).
func MongoURLFromEnv() (string, error) {
	if u := strings.TrimSpace(os.Getenv("MONGO_URL")); u != "" {
		return u, nil
	}
	mongoUsername := os.Getenv("MONGO_USERNAME")
	if mongoUsername == "" {
		return "", errors.New("MONGO_URL or MONGO_USERNAME is required")
	}
	mongoPassword := os.Getenv("MONGO_PASSWORD")
	if mongoPassword == "" {
		return "", errors.New("MONGO_PASSWORD environment variable is required")
	}

	const mongoDatabase = "eve_industry_planner"
	mongoHost := getEnv("MONGO_HOST", "mongo")
	mongoPort := getEnv("MONGO_PORT", "27017")
	mongoReplicaSet := getEnv("MONGO_REPLICA_SET", "rs0")
	escapedMongoUsername := url.QueryEscape(mongoUsername)
	escapedMongoPassword := url.QueryEscape(mongoPassword)
	mongoURL := "mongodb://" + escapedMongoUsername + ":" + escapedMongoPassword + "@" + mongoHost + ":" + mongoPort + "/" + mongoDatabase + "?authSource=" + mongoDatabase + "&replicaSet=" + mongoReplicaSet
	return mongoURL, nil
}

func LoadConfig() (Config, error) {
	mongoURL, err := MongoURLFromEnv()
	if err != nil {
		return Config{}, err
	}

	// Redis password is REQUIRED - no fallbacks
	redisPassword := os.Getenv("REDIS_PASSWORD")
	if redisPassword == "" {
		return Config{}, errors.New("REDIS_PASSWORD environment variable is required")
	}

	// Build Redis URL with password
	redisHost := getEnv("REDIS_HOST", "redis")
	redisPort := getEnv("REDIS_PORT", "6379")
	redisURL := "redis://:" + redisPassword + "@" + redisHost + ":" + redisPort

	rtSpec, err := keyrings.NewRefreshTokenKeyringSpec()
	if err != nil {
		return Config{}, err
	}

	return Config{
		MONGO_URL:                     mongoURL,
		REDIS_URL:                     redisURL,
		NATS_URL:                      getEnv("NATS_URL", "nats://nats:4222"),
		MINIO_URL:                     getEnv("MINIO_URL", "http://minio:9000"),
		API_PORT:                      getEnv("API_PORT", "4000"),
		WS_PORT:                       getEnv("WS_PORT", "4001"),
		AuthSecret:                    getEnv("AUTH_SECRET", "dev-secret-change"),
		JWTPrivateKeyEnvVar:           getEnv("JWT_PRIVATE_KEY_ENV_VAR", "JWT_PRIVATE_KEY"), // Environment variable name containing the key
		JWTKeyID:                      getEnv("JWT_KEY_ID", "default-key-id"),
		ExternalJWTSecret:             getEnv("EXTERNAL_JWT_SECRET", "dev-external-secret"),
		ExternalJWTIssuer:             getEnv("EXTERNAL_JWT_ISSUER", ""),
		ExternalJWTAudience:           getEnv("EXTERNAL_JWT_AUDIENCE", ""),
		EveSSOClientID:                getEnv("EVE_CLIENT_ID", ""),
		EveSSOClientSecret:            getEnv("EVE_CLIENT_SECRET", ""),
		FeedbackDiscordWebhookURL:     getEnv("FEEDBACK_DISCORD_WEBHOOK_URL", ""),
		RefreshTokenKeyring:           rtSpec.Keyring,
		RefreshTokenActiveVersion:     rtSpec.ActiveVersion,
		RefreshTokenSupportedVersions: rtSpec.SupportedVersions,
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
