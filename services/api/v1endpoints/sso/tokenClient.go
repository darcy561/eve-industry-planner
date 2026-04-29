package sso

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	ssohelper "eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/core/retry"
	"eve-industry-planner/shared/logs"
)

func newEveSSOTokenRequest(ctx context.Context, clientID, clientSecret, grantType, grantValue string) (*http.Request, error) {
	authHeader := base64.StdEncoding.EncodeToString([]byte(clientID + ":" + clientSecret))
	data := url.Values{}
	data.Set("grant_type", grantType)
	switch grantType {
	case "authorization_code":
		data.Set("code", grantValue)
	case "refresh_token":
		data.Set("refresh_token", grantValue)
	}
	req, err := http.NewRequestWithContext(ctx, "POST", eveSSOTokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", "Basic "+authHeader)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Host", "login.eveonline.com")
	return req, nil
}

func exchangeAuthCodeForEveSSOTokens(ctx context.Context, clientID, clientSecret, authCode string) (*EveSSOTokenPayload, error) {
	req, err := newEveSSOTokenRequest(ctx, clientID, clientSecret, "authorization_code", authCode)
	if err != nil {
		return nil, err
	}
	return performEveSSOTokenRequestWithRetry(ctx, req)
}

func refreshEveSSOAccessToken(ctx context.Context, clientID, clientSecret, refreshToken string) (*EveSSOTokenPayload, error) {
	req, err := newEveSSOTokenRequest(ctx, clientID, clientSecret, "refresh_token", refreshToken)
	if err != nil {
		return nil, err
	}
	return performEveSSOTokenRequestWithRetry(ctx, req)
}

func performEveSSOTokenRequestWithRetry(ctx context.Context, req *http.Request) (*EveSSOTokenPayload, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	var tokenResp EveSSOTokenPayload
	retryErr := retry.Do(ctx, func(ctx context.Context) error {
		attemptReq := req.Clone(ctx)
		if req.GetBody != nil {
			body, err := req.GetBody()
			if err != nil {
				return fmt.Errorf("failed to recreate request body: %w", err)
			}
			attemptReq.Body = body
		}
		resp, err := client.Do(attemptReq)
		if err != nil {
			return eveSSORetryableError{err: fmt.Errorf("failed to make request to EVE SSO: %w", err)}
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return eveSSORetryableError{err: fmt.Errorf("failed to read response body: %w", err)}
		}
		if resp.StatusCode == http.StatusNoContent {
			return eveSSORetryableError{err: errors.New("EVE SSO Error: No content received")}
		}
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			var errorResp EveSSOErrorResponse
			if err := json.Unmarshal(body, &errorResp); err == nil && errorResp.ErrorDescription != "" {
				return fmt.Errorf("EVE SSO Error: %s", errorResp.ErrorDescription)
			}
			return fmt.Errorf("EVE SSO Error: Unknown error (status %d)", resp.StatusCode)
		}
		if resp.StatusCode >= 500 {
			var serverErr error
			var errorResp EveSSOErrorResponse
			if err := json.Unmarshal(body, &errorResp); err == nil && errorResp.ErrorDescription != "" {
				serverErr = fmt.Errorf("EVE SSO Error: %s", errorResp.ErrorDescription)
			} else {
				serverErr = fmt.Errorf("EVE SSO Error: Server error (status %d)", resp.StatusCode)
			}
			return eveSSORetryableError{err: serverErr}
		}
		if err := json.Unmarshal(body, &tokenResp); err != nil {
			return fmt.Errorf("failed to parse token response: %w", err)
		}
		return nil
	}, func(err error, attempt retry.AttemptContext) bool {
		var retryableErr eveSSORetryableError
		if !errors.As(err, &retryableErr) {
			return false
		}
		logs.WarnCtx(ctx, "retrying EVE SSO token request", "attempt", attempt.Attempt, "max_attempts", attempt.MaxAttempts, "error", err)
		return true
	}, retry.WithOperationName("eve_sso_token_request"))
	if retryErr != nil {
		return nil, retryErr
	}
	return &tokenResp, nil
}

func extractCharacterHashFromEveSSOAccessToken(tokenString, clientID string) (string, error) {
	validatedClaims, err := ssohelper.ValidateEveSSOToken(tokenString, clientID)
	if err != nil {
		return "", fmt.Errorf("validated parse failed: %w", err)
	}
	return validatedClaims.Owner, nil
}
