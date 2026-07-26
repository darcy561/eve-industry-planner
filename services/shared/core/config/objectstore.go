package config

import (
	"strings"

	"eve-industry-planner/shared/core/swarmsecret"
)

// ObjectStore holds object-store connection settings.
type ObjectStore struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	UseSSL    bool
	KeyPrefix string
}

// ObjectStoreConfig loads object-store connection settings.
// S3_URL is mesh env; access/secret keys use [swarmsecret] lookup.
func ObjectStoreConfig() (ObjectStore, error) {
	endpoint, err := swarmsecret.Require("S3_URL")
	if err != nil {
		return ObjectStore{}, err
	}
	accessKey, err := swarmsecret.Require("S3_ACCESS_KEY")
	if err != nil {
		return ObjectStore{}, err
	}
	secretKey, err := swarmsecret.Require("S3_SECRET_KEY")
	if err != nil {
		return ObjectStore{}, err
	}
	return ObjectStore{
		Endpoint:  endpoint,
		AccessKey: accessKey,
		SecretKey: secretKey,
		UseSSL:    strings.HasPrefix(strings.ToLower(endpoint), "https://"),
		KeyPrefix: swarmsecret.Get("SDE_STORE_KEY_PREFIX"),
	}, nil
}
