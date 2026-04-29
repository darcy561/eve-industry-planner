package sso

import (
	"errors"
	"strings"

	"eve-industry-planner/api/helper"
	"net/http"
)

func extractAuthCodeFromRequest(r *http.Request) (string, bool, error) {
	var reqBody EveSSOExchangeRequest
	if err := helper.DecodeJSONRequest(r, &reqBody, maxAuthCodeLength+1024); err != nil {
		return "", false, err
	}
	if reqBody.AuthCode == "" {
		return "", false, errors.New("auth_code is required in request body")
	}
	authCode := strings.TrimSpace(reqBody.AuthCode)
	if authCode == "" {
		return "", false, errors.New("auth_code cannot be empty")
	}
	return authCode, reqBody.AccountType, nil
}

func extractRefreshTokenFromSSORequest(r *http.Request) (string, error) {
	var reqBody EveSSORefreshRequest
	if err := helper.DecodeJSONRequest(r, &reqBody, maxRefreshTokenLength+1024); err != nil {
		return "", err
	}
	if reqBody.RefreshToken == "" {
		return "", errors.New("refresh_token is required in request body")
	}
	refreshToken := strings.TrimSpace(reqBody.RefreshToken)
	if refreshToken == "" {
		return "", errors.New("refresh_token cannot be empty")
	}
	return refreshToken, nil
}
