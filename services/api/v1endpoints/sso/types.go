package sso

import (
	evesso "eve-industry-planner/shared/evesso"
)

const (
	maxAuthCodeLength     = evesso.MaxAuthCodeLength
	maxRefreshTokenLength = evesso.MaxRefreshTokenLength
)

type EveSSOTokenPayload = evesso.EveSSOTokenPayload

type EveSSOExchangeRequest struct {
	AuthCode    string `json:"auth_code"`
	AccountType bool   `json:"account_type,omitzero"`
	// State is the value this browser was issued by the sign-in state route and
	// carried to EVE. Required: a callback the API did not start cannot have one.
	State string `json:"state"`
}

type EveSSORefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type EveSSOErrorResponse = evesso.EveSSOErrorResponse
