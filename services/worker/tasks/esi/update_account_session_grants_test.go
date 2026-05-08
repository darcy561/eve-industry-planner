package tasks

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/alicebob/miniredis/v2"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

// mockESIClient implements ClientInterface for testing
type mockESIClient struct {
	doFunc func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error)
}

func (m *mockESIClient) Do(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
	if m.doFunc != nil {
		return m.doFunc(ctx, method, path, headers, body, groupDesignation)
	}
	return nil, nil, errors.New("doFunc not set")
}

func (m *mockESIClient) DoRequest(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
	return nil, errors.New("not implemented")
}

// setupAccountSessionGrantsTestEnv configures env vars required by [config.LoadConfig] and returns
// an in-memory Redis client so [RefreshAccountSessionGrants] can persist grants without a real Redis.
func setupAccountSessionGrantsTestEnv(t *testing.T) *redis.Client {
	t.Helper()
	t.Setenv("MONGO_URL", "mongodb://127.0.0.1:27017/eve_industry_planner")
	t.Setenv("REDIS_PASSWORD", "test-redis-password")
	t.Setenv("REFRESH_TOKEN_AES_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte("x"), 32)))
	t.Setenv("EVE_CLIENT_ID", "test-eve-client-id")

	srv, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { srv.Close() })
	rdb := redis.NewClient(&redis.Options{Addr: srv.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb
}

// Helper to create a test affiliation POST response (character_id, corporation_id, alliance_id).
func createAffiliationJSON(corporationID, allianceID int) []byte {
	row := CharacterAffiliation{CharacterID: 1, CorporationID: corporationID, AllianceID: allianceID}
	data, _ := json.Marshal([]CharacterAffiliation{row})
	return data
}

// Helper to create a mock asynq.Task for testing
func createMockTask(taskType string, data interface{}) *asynq.Task {
	// Create the task payload structure
	var payloadData json.RawMessage
	if data != nil {
		dataBytes, _ := json.Marshal(data)
		// Wrap data in TaskMessage structure
		taskMsg := natscore.TaskMessage{
			TaskType: taskType,
			Data:     dataBytes,
		}
		taskMsgBytes, _ := json.Marshal(taskMsg)
		payloadData = taskMsgBytes
	}

	// Wrap in taskPayload structure
	taskPayload := struct {
		TaskType string          `json:"task_type"`
		Data     json.RawMessage `json:"data"`
	}{
		TaskType: taskType,
		Data:     payloadData,
	}

	payloadBytes, _ := json.Marshal(taskPayload)
	return asynq.NewTask(taskType, payloadBytes)
}

func TestRefreshAccountSessionGrants_NilTask(t *testing.T) {
	ctx := context.Background()
	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      &mockESIClient{},
	}

	err := RefreshAccountSessionGrants(ctx, nil, deps)
	if err == nil {
		t.Error("expected error when task is nil")
	}
}

func TestRefreshAccountSessionGrants_InvalidJSON(t *testing.T) {
	ctx := context.Background()
	// Create a task with invalid JSON payload
	invalidPayload := struct {
		TaskType string          `json:"task_type"`
		Data     json.RawMessage `json:"data"`
	}{
		TaskType: "updateAccountSessionGrants",
		Data:     []byte("invalid json"),
	}
	payloadBytes, _ := json.Marshal(invalidPayload)
	task := asynq.NewTask("updateAccountSessionGrants", payloadBytes)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      &mockESIClient{},
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	if err == nil {
		t.Error("expected error when JSON is invalid")
	}
}

func TestRefreshAccountSessionGrants_MissingAccountID(t *testing.T) {
	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "",
		Tokens:    []string{"token1"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      &mockESIClient{},
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	if err == nil {
		t.Fatal("expected error when account_id is missing")
	}
	if err.Error() != "missing account_id" {
		t.Fatalf("expected missing account_id error, got: %v", err)
	}
}

func TestRefreshAccountSessionGrants_EmptyTokens(t *testing.T) {
	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      &mockESIClient{},
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	if err == nil {
		t.Fatal("expected error when no tokens provided")
	}
	if err.Error() != "no tokens provided" {
		t.Fatalf("expected no tokens provided error, got: %v", err)
	}
}

func TestRefreshAccountSessionGrants_TokenValidationFailure(t *testing.T) {
	// Invalid tokens yield no character IDs; the task still stores empty corp/alliance lists and exits cleanly.
	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"invalid-token-that-will-fail-validation"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{
			Redis: setupAccountSessionGrantsTestEnv(t),
		},
		ESIClient: &mockESIClient{},
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	if err != nil {
		t.Fatalf("expected nil after skipping invalid tokens (empty grants persisted): %v", err)
	}
}

// TestRefreshAccountSessionGrants_MissingCharacterID tests the case where
// a token validates but has no character ID. This requires a valid token structure
// which is difficult to create without proper JWT signing, so this test is
// more suited for integration testing with real tokens.
// For unit testing, we verify the logic path exists in the code.
func TestRefreshAccountSessionGrants_MissingCharacterID(t *testing.T) {
	t.Skip("Requires valid JWT token structure - better suited for integration tests")
}

// TestRefreshAccountSessionGrants_InvalidCharacterIDFormat tests the case where
// character ID is not a valid integer. This requires a valid token structure
// which is difficult to create without proper JWT signing, so this test is
// more suited for integration testing with real tokens.
func TestRefreshAccountSessionGrants_InvalidCharacterIDFormat(t *testing.T) {
	t.Skip("Requires valid JWT token structure - better suited for integration tests")
}

func TestRefreshAccountSessionGrants_ESIRetryableRateLimitError(t *testing.T) {
	// Note: This test would require a valid SSO token to pass validation.
	// For unit testing purposes, we test the ESI error handling path.
	// In a real scenario, you'd use integration tests with valid tokens.
	t.Skip("Requires valid SSO token - testing ESI error handling is better done in integration tests")

	// The following code shows the expected behavior:
	// When ESI returns a retryable rate limit error, the message should be nacked
	/*
		request := natscore.AccountSessionGrantsRequest{
			AccountID: "test-account-123",
			Tokens:    []string{"valid-token"},
		}
		data, _ := json.Marshal(request)

		msg := &mockMessage{
			data:          data,
			deliveryCount: 1,
		}

		esiClient := &mockESIClient{
			doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
				return nil, nil, &esiratelimiter.RateLimitError{
					Retryable:  true,
					RetryAfter: time.Now().Add(30 * time.Second),
					Reason:     "insufficient tokens",
				}
			},
		}

		deps := &TaskDependencies{
			ServiceClients: &shared.ServiceClients{},
			ESIClient:      esiClient,
		}

		RefreshAccountSessionGrants(msg, deps)

		if !msg.nakCalled {
			t.Error("expected message to be nacked for retryable rate limit error")
		}
	*/
}

func TestRefreshAccountSessionGrants_ESINonRetryableError(t *testing.T) {
	// Note: This test would require a valid SSO token to pass validation.
	// For unit testing purposes, we test the ESI error handling path.
	t.Skip("Requires valid SSO token - testing ESI error handling is better done in integration tests")

	// Mock ESI client to return non-retryable error
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			return nil, nil, errors.New("network error")
		},
	}

	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      esiClient,
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should succeed even if ESI call fails (non-retryable) - continues with other tokens
	_ = err // May succeed or fail depending on token validation
}

func TestRefreshAccountSessionGrants_ESINon200Status(t *testing.T) {
	// Note: This test would require a valid SSO token to pass validation.
	t.Skip("Requires valid SSO token - testing ESI status codes is better done in integration tests")

	// Mock ESI client to return 404 status
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			resp := &http.Response{
				StatusCode: 404,
				Status:     "404 Not Found",
			}
			return nil, resp, nil
		},
	}

	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      esiClient,
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should succeed even if ESI returns non-200 - continues with other tokens
	_ = err // May succeed or fail depending on token validation
}

func TestRefreshAccountSessionGrants_InvalidJSONResponse(t *testing.T) {
	// Note: This test would require a valid SSO token to pass validation.
	t.Skip("Requires valid SSO token - testing JSON parsing is better done in integration tests")

	// Mock ESI client to return invalid JSON
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			resp := &http.Response{
				StatusCode: 200,
				Status:     "200 OK",
			}
			return []byte("invalid json"), resp, nil
		},
	}

	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      esiClient,
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should succeed even if JSON parsing fails - continues with other tokens
	_ = err // May succeed or fail depending on token validation
}

func TestRefreshAccountSessionGrants_SuccessfulProcessing(t *testing.T) {
	// Note: This test requires valid SSO tokens which is complex to create in unit tests.
	// This is better suited for integration tests with real tokens.
	t.Skip("Requires valid SSO tokens - better suited for integration tests")

	ctx := context.Background()
	// Mock ESI client to return successful responses
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			// POST /characters/affiliation/ with JSON array body (integration-style mock)
			_ = body
			var corpID int
			switch path {
			case "/characters/affiliation/?datasource=tranquility":
				corpID = 1001
			default:
				corpID = 1003
			}

			resp := &http.Response{
				StatusCode: 200,
				Status:     "200 OK",
			}
			return createAffiliationJSON(corpID, 0), resp, nil
		},
	}

	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1", "token2", "token3"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      esiClient,
	}

	// We need to mock StoreCorporations - but it's in a different package
	// For now, we'll test that the function completes successfully
	// In a real scenario, you might want to use dependency injection or a test helper

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should succeed on success
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRefreshAccountSessionGrants_DuplicateCorporations(t *testing.T) {
	// Note: This test requires valid SSO tokens.
	t.Skip("Requires valid SSO tokens - better suited for integration tests")

	// Mock ESI client to return same corporation ID for all
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			resp := &http.Response{
				StatusCode: 200,
				Status:     "200 OK",
			}
			return createAffiliationJSON(1001, 0), resp, nil
		},
	}

	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1", "token2", "token3"}, // All same character
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      esiClient,
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should succeed (deduplication happens in the function)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRefreshAccountSessionGrants_ZeroCorporationID(t *testing.T) {
	// Note: This test requires valid SSO tokens.
	t.Skip("Requires valid SSO tokens - better suited for integration tests")

	// Mock ESI client to return corporation ID of 0 (should be skipped)
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			resp := &http.Response{
				StatusCode: 200,
				Status:     "200 OK",
			}
			return createAffiliationJSON(0, 0), resp, nil
		},
	}

	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      esiClient,
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should succeed (zero corp ID is skipped)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRefreshAccountSessionGrants_MixedSuccessAndFailure(t *testing.T) {
	// Note: This test requires valid SSO tokens.
	t.Skip("Requires valid SSO tokens - better suited for integration tests")

	// Mock ESI client to succeed for first call
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			resp := &http.Response{
				StatusCode: 200,
				Status:     "200 OK",
			}
			return createAffiliationJSON(1001, 0), resp, nil
		},
	}

	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1", "token2"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      esiClient,
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should succeed even if some tokens fail (partial success)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// Integration-style test with real Redis mock (if needed)
// This would require a more sophisticated Redis mock or testcontainers
func TestRefreshAccountSessionGrants_RedisStorageFailure(t *testing.T) {
	// This test would require mocking StoreCorporations or using dependency injection.
	// Since StoreCorporations is in a different package and uses Redis directly,
	// this is better tested with integration tests or by refactoring to use an interface.
	t.Skip("Requires valid SSO tokens and Redis mocking - better suited for integration tests")

	ctx := context.Background()
	// Mock ESI client to succeed
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			resp := &http.Response{
				StatusCode: 200,
				Status:     "200 OK",
			}
			return createAffiliationJSON(1001, 0), resp, nil
		},
	}

	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	// Use nil Redis to trigger storage error
	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{
			Redis: nil, // This will cause StoreCorporations to fail
		},
		ESIClient: esiClient,
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should return error if storage fails
	if err == nil {
		t.Error("expected error when Redis storage fails")
	}
}

// Test helper to verify the function handles nil response
func TestRefreshAccountSessionGrants_NilResponse(t *testing.T) {
	// Note: This test requires valid SSO tokens.
	t.Skip("Requires valid SSO tokens - better suited for integration tests")

	// Mock ESI client to return nil response
	esiClient := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			return []byte("test"), nil, nil // nil response
		},
	}

	ctx := context.Background()
	request := natscore.AccountSessionGrantsRequest{
		AccountID: "test-account-123",
		Tokens:    []string{"token1"},
	}
	task := createMockTask("updateAccountSessionGrants", request)

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{},
		ESIClient:      esiClient,
	}

	err := RefreshAccountSessionGrants(ctx, task, deps)
	// Should succeed when response is nil - continues with other tokens
	_ = err // May succeed or fail depending on token validation
}
