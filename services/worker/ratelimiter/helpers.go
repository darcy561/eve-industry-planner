package ratelimiter

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// buildGroupNameFromDesignation builds a group name from GroupDesignation.
// Format: "PrimaryGroup-SecondaryGroup" or "PrimaryGroup" if SecondaryGroup is empty.
func buildGroupNameFromDesignation(designation GroupDesignation) string {
	if designation.SecondaryGroup == "" {
		return designation.PrimaryGroup
	}
	return fmt.Sprintf("%s-%s", designation.PrimaryGroup, designation.SecondaryGroup)
}

// getTokensForStatus returns token cost based on HTTP status code per ESI rules
func getTokensForStatus(statusCode int) int {
	switch {
	case statusCode >= 200 && statusCode < 300:
		return 2 // 2XX responses cost 2 tokens
	case statusCode >= 300 && statusCode < 400:
		return 1 // 3XX responses cost 1 token
	case statusCode >= 400 && statusCode < 500:
		return 5 // 4XX responses cost 5 tokens
	case statusCode >= 500:
		return 0 // 5XX responses cost 0 tokens
	default:
		return 2 // Default to 2 for unknown status codes
	}
}

// parseTokenLimitFromHeader parses X-Ratelimit-Limit header which is in format "600/15m" or "150/15m"
// Returns the token limit (first number) and true if parsing succeeded, or 0 and false if failed
func parseTokenLimitFromHeader(limitStr string) (int, bool) {
	if limitStr == "" {
		return 0, false
	}

	// Format is: "{tokens}/{duration}{unit}" e.g., "600/15m" or "150/15m"
	// We only need the token limit part (before the "/")
	// Handle case where there's no "/" (just a number)
	if !strings.Contains(limitStr, "/") {
		// Try parsing as plain integer (fallback)
		if limit, err := strconv.Atoi(strings.TrimSpace(limitStr)); err == nil {
			return limit, true
		}
		return 0, false
	}

	parts := strings.Split(limitStr, "/")
	if len(parts) == 0 {
		return 0, false
	}

	// Parse the token limit (first part)
	tokenLimit, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil {
		return 0, false
	}

	return tokenLimit, true
}

// tunedTransport returns a configured HTTP transport matching the existing configuration
func tunedTransport() *http.Transport {
	return &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ForceAttemptHTTP2:     true,
		DisableCompression:    false,
	}
}
