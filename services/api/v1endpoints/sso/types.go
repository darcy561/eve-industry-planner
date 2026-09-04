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
	AccountType bool   `json:"account_type,omitempty"`
}

type EveSSORefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type EveSSOErrorResponse = evesso.EveSSOErrorResponse
