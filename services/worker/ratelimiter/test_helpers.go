package ratelimiter

import (
	"net/http"
	"net/http/httptest"
	"time"

	"golang.org/x/time/rate"
)

// mockTimeProvider allows controlling time in tests
// This is kept for future use when we need to mock time in tests
// type mockTimeProvider struct {
// 	now time.Time
// }
//
// func (m *mockTimeProvider) Now() time.Time {
// 	return m.now
// }
//
// func (m *mockTimeProvider) Advance(d time.Duration) {
// 	m.now = m.now.Add(d)
// }

// createTestGroupLimiter creates a GroupLimiter for testing
func createTestGroupLimiter(name string, tokenLimit int, tokenUsed int) *GroupLimiter {
	// Set EnforceTokenRestrictions to true if tokenLimit > 0 (headers present)
	enforceTokens := tokenLimit > 0
	limiter := &GroupLimiter{
		Name:                     name,
		EnforceTokenRestrictions: enforceTokens,
		TokenLimit:               tokenLimit,
		TokenUsed:                tokenUsed,
		consumptions:             make([]TokenConsumption, 0),
		windowDuration:           15 * time.Minute,
		lastUpdate:               time.Now(),
		lastUsed:                 time.Now(),
		Limiter:                  rate.NewLimiter(rate.Limit(1.0), 10),
		DefaultRate:              rate.Limit(1.0),
		DefaultBurst:             10,
	}
	return limiter
}

// createTestESIClient creates an ESIClient for testing
func createTestESIClient(baseURL string) *ESIClient {
	return NewESIClient(baseURL, 1.0, 10)
}

// createMockHTTPServer creates a mock HTTP server for testing
func createMockHTTPServer(handler func(w http.ResponseWriter, r *http.Request)) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(handler))
}

// createMockResponse creates a mock HTTP response with rate limit headers
func createMockResponse(statusCode int, headers map[string]string) *http.Response {
	resp := &http.Response{
		StatusCode: statusCode,
		Header:     make(http.Header),
		Body:       http.NoBody,
	}

	for k, v := range headers {
		resp.Header.Set(k, v)
	}

	return resp
}

// addTokenConsumption adds a token consumption to a limiter at a specific time
func addTokenConsumption(gl *GroupLimiter, tokens int, consumedAt time.Time) {
	gl.mu.Lock()
	defer gl.mu.Unlock()
	gl.consumptions = append(gl.consumptions, TokenConsumption{
		Tokens:   tokens,
		Consumed: consumedAt,
	})
	gl.TokenUsed += tokens
}
