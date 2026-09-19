package sso

import (
	"errors"
	"strings"

	"eve-industry-planner/api/helper"
	"net/http"
)

func extractAuthCodeFromRequest(r *http.Request) (EveSSOExchangeRequest, error) {
	var reqBody EveSSOExchangeRequest
	if err := helper.DecodeJSONRequest(r, &reqBody, maxAuthCodeLength+1024); err != nil {
		return EveSSOExchangeRequest{}, err
	}
	reqBody.AuthCode = strings.TrimSpace(reqBody.AuthCode)
	reqBody.State = strings.TrimSpace(reqBody.State)
	if reqBody.AuthCode == "" {
		return EveSSOExchangeRequest{}, errors.New("auth_code is required in request body")
	}
	if reqBody.State == "" {
		return EveSSOExchangeRequest{}, errors.New("state is required in request body")
	}
	return reqBody, nil
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
