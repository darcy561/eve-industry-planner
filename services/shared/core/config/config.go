package config

import (
	"errors"
	"os"
)

type Config struct {
	MONGO_URL                 string
	MONGO_SECONDARY_URL       string
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
}

func LoadConfig() (Config, error) {
	// MongoDB primary credentials are REQUIRED - no fallbacks
	mongoUsername := os.Getenv("MONGO_USERNAME")
	if mongoUsername == "" {
		return Config{}, errors.New("MONGO_USERNAME environment variable is required")
	}
	mongoPassword := os.Getenv("MONGO_PASSWORD")
	if mongoPassword == "" {
		return Config{}, errors.New("MONGO_PASSWORD environment variable is required")
	}

	// MongoDB secondary uses the same credentials as primary (users are replicated in replica set)

	// Redis password is REQUIRED - no fallbacks
	redisPassword := os.Getenv("REDIS_PASSWORD")
	if redisPassword == "" {
		return Config{}, errors.New("REDIS_PASSWORD environment variable is required")
	}

	// Service URLs and ports have hardcoded defaults but can be overridden via environment variables
	// Database name is hardcoded and cannot be changed
	const mongoDatabase = "eve_industry_planner"

	// Build primary MongoDB URL
	mongoHost := getEnv("MONGO_HOST", "mongo")
	mongoPort := getEnv("MONGO_PORT", "27017")
	mongoURL := "mongodb://" + mongoUsername + ":" + mongoPassword + "@" + mongoHost + ":" + mongoPort + "/" + mongoDatabase + "?authSource=admin"

	// Build secondary MongoDB URL (uses same credentials as primary)
	mongoSecondaryHost := getEnv("MONGO_SECONDARY_HOST", "mongo-secondary")
	mongoSecondaryPort := getEnv("MONGO_SECONDARY_PORT", "27017")
	mongoSecondaryURL := "mongodb://" + mongoUsername + ":" + mongoPassword + "@" + mongoSecondaryHost + ":" + mongoSecondaryPort + "/" + mongoDatabase + "?authSource=admin"

	// Build Redis URL with password
	redisHost := getEnv("REDIS_HOST", "redis")
	redisPort := getEnv("REDIS_PORT", "6379")
	redisURL := "redis://:" + redisPassword + "@" + redisHost + ":" + redisPort

	return Config{
		MONGO_URL:                 mongoURL,
		MONGO_SECONDARY_URL:       mongoSecondaryURL,
		REDIS_URL:                 redisURL,
		NATS_URL:                  getEnv("NATS_URL", "nats://nats:4222"),
		MINIO_URL:                 getEnv("MINIO_URL", "http://minio:9000"),
		API_PORT:                  getEnv("API_PORT", "4000"),
		WS_PORT:                   getEnv("WS_PORT", "4001"),
		AuthSecret:                getEnv("AUTH_SECRET", "dev-secret-change"),
		JWTPrivateKeyEnvVar:       getEnv("JWT_PRIVATE_KEY_ENV_VAR", "JWT_PRIVATE_KEY"), // Environment variable name containing the key
		JWTKeyID:                  getEnv("JWT_KEY_ID", "default-key-id"),
		ExternalJWTSecret:         getEnv("EXTERNAL_JWT_SECRET", "dev-external-secret"),
		ExternalJWTIssuer:         getEnv("EXTERNAL_JWT_ISSUER", ""),
		ExternalJWTAudience:       getEnv("EXTERNAL_JWT_AUDIENCE", ""),
		EveSSOClientID:            getEnv("EVE_CLIENT_ID", ""),
		EveSSOClientSecret:        getEnv("EVE_CLIENT_SECRET", ""),
		FeedbackDiscordWebhookURL: getEnv("FEEDBACK_DISCORD_WEBHOOK_URL", ""),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
