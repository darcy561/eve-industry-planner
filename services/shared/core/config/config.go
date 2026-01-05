package config

import (
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

func LoadConfig() Config {
	return Config{
		MONGO_URL:                 getEnv("MONGO_URL", "mongodb://mongo:27017/eve_industry"),
		REDIS_URL:                 getEnv("REDIS_URL", "redis:6379"),
		NATS_URL:                  getEnv("NATS_URL", "nats://nats:4222"),
		MINIO_URL:                 getEnv("MINIO_URL", "http://minio:9000"),
		API_PORT:                  "4000",
		WS_PORT:                   "4001",
		AuthSecret:                getEnv("AUTH_SECRET", "dev-secret-change"),
		JWTPrivateKeyEnvVar:       getEnv("JWT_PRIVATE_KEY_ENV_VAR", "JWT_PRIVATE_KEY"), // Environment variable name containing the key
		JWTKeyID:                  getEnv("JWT_KEY_ID", "default-key-id"),
		ExternalJWTSecret:         getEnv("EXTERNAL_JWT_SECRET", "dev-external-secret"),
		ExternalJWTIssuer:         getEnv("EXTERNAL_JWT_ISSUER", ""),
		ExternalJWTAudience:       getEnv("EXTERNAL_JWT_AUDIENCE", ""),
		EveSSOClientID:            getEnv("EVE_CLIENT_ID", ""),
		EveSSOClientSecret:        getEnv("EVE_CLIENT_SECRET", ""),
		FeedbackDiscordWebhookURL: getEnv("FEEDBACK_DISCORD_WEBHOOK_URL", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
