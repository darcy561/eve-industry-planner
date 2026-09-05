package config

import (
	"eve-industry-planner/shared/crypto/aesgcm"
	"eve-industry-planner/shared/crypto/aesgcm/keyrings"
)

// CloudStoredESIKeys is the AES keyring for encrypting cloud-stored ESI OAuth
// refresh material (users.refreshTokens ciphertext), not app session refresh cookies.
type CloudStoredESIKeys struct {
	Keyring           *aesgcm.Keyring
	ActiveVersion     string
	SupportedVersions map[string]struct{}
}

// LoadCloudStoredESIKeys loads the cloud-stored ESI encryption keyring.
// Does not require mongo, redis, nats, SSO, or auth secrets.
func LoadCloudStoredESIKeys() (CloudStoredESIKeys, error) {
	spec, err := keyrings.NewRefreshTokenKeyringSpec()
	if err != nil {
		return CloudStoredESIKeys{}, err
	}
	return CloudStoredESIKeys{
		Keyring:           spec.Keyring,
		ActiveVersion:     spec.ActiveVersion,
		SupportedVersions: spec.SupportedVersions,
	}, nil
}

// CloudStoredESI is EVE SSO client credentials plus the cloud-stored ESI keyring.
type CloudStoredESI struct {
	SSO  EveSSO
	Keys CloudStoredESIKeys
}

// LoadCloudStoredESI loads SSO credentials and the cloud-stored ESI keyring only.
func LoadCloudStoredESI() (CloudStoredESI, error) {
	keys, err := LoadCloudStoredESIKeys()
	if err != nil {
		return CloudStoredESI{}, err
	}
	return CloudStoredESI{
		SSO:  LoadEveSSO(),
		Keys: keys,
	}, nil
}
