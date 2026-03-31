package config

import (
	"errors"
	"net/url"
	"os"
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

	// Redis password is REQUIRED - no fallbacks
	redisPassword := os.Getenv("REDIS_PASSWORD")
	if redisPassword == "" {
		return Config{}, errors.New("REDIS_PASSWORD environment variable is required")
	}

	// Service URLs and ports have hardcoded defaults but can be overridden via environment variables
	// Database name is hardcoded and cannot be changed
	const mongoDatabase = "eve_industry_planner"

	// Build primary MongoDB URL
	// Include replicaSet parameter for single-node replica set deployments.
	mongoHost := getEnv("MONGO_HOST", "mongo")
	mongoPort := getEnv("MONGO_PORT", "27017")
	mongoReplicaSet := getEnv("MONGO_REPLICA_SET", "rs0")
	escapedMongoUsername := url.QueryEscape(mongoUsername)
	escapedMongoPassword := url.QueryEscape(mongoPassword)
	mongoURL := "mongodb://" + escapedMongoUsername + ":" + escapedMongoPassword + "@" + mongoHost + ":" + mongoPort + "/" + mongoDatabase + "?authSource=" + mongoDatabase + "&replicaSet=" + mongoReplicaSet

	// Build Redis URL with password
	redisHost := getEnv("REDIS_HOST", "redis")
	redisPort := getEnv("REDIS_PORT", "6379")
	redisURL := "redis://:" + redisPassword + "@" + redisHost + ":" + redisPort

	return Config{
		MONGO_URL:                 mongoURL,
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
