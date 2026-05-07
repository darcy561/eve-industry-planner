package helpers

import (
	"fmt"

	"eve-industry-planner/shared/core/authzhmac"
	"eve-industry-planner/shared/core/config"
	corecrypto "eve-industry-planner/shared/core/crypto"
)

// LoadPipelineCrypto loads config and HMAC helpers used across archived-job snapshot/rebuild/removal paths.
func LoadPipelineCrypto() (config.Config, *corecrypto.Keyring, *authzhmac.Helper, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return config.Config{}, nil, nil, err
	}
	if cfg.RefreshTokenKeyring == nil {
		return config.Config{}, nil, nil, fmt.Errorf("refresh token keyring is not configured")
	}
	h, err := authzhmac.NewFromEnv()
	if err != nil {
		return config.Config{}, nil, nil, err
	}
	return cfg, cfg.RefreshTokenKeyring, h, nil
}
