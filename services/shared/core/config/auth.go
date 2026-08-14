package config

import "eve-industry-planner/shared/core/swarmsecret"

// EveSSO holds EVE SSO client credentials.
type EveSSO struct {
	ClientID     string
	ClientSecret string
}

// LoadEveSSO loads SSO settings. Client secret uses swarmsecret lookup; client id is public-ish.
func LoadEveSSO() EveSSO {
	return EveSSO{
		ClientID:     swarmsecret.Get("EVE_CLIENT_ID"),
		ClientSecret: swarmsecret.Get("EVE_CLIENT_SECRET"),
	}
}
