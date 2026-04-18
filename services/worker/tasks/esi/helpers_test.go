package tasks

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	esiratelimiter "eve-industry-planner/worker/ratelimiter"
)

func TestDoWithRetry_SucceedsFirstAttempt(t *testing.T) {
	ctx := context.Background()
	calls := 0
	body, resp, err := DoWithRetry(ctx, 4, "/test", func() ([]byte, *http.Response, error) {
		calls++
		return []byte("ok"), &http.Response{StatusCode: http.StatusOK}, nil
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected 1 attempt, got %d", calls)
	}
	if string(body) != "ok" {
		t.Fatalf("body: %q", body)
	}
	if resp == nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("bad resp: %+v", resp)
	}
}

func TestDoWithRetry_StopsImmediatelyOnRateLimitError(t *testing.T) {
	ctx := context.Background()
	rlErr := &esiratelimiter.RateLimitError{
		Retryable:  true,
		RetryAfter: time.Now().Add(time.Minute),
		Reason:     "test",
		Group:      "g",
	}
	calls := 0
	_, _, err := DoWithRetry(ctx, 4, "/rl", func() ([]byte, *http.Response, error) {
		calls++
		return nil, nil, rlErr
	})
	var as *esiratelimiter.RateLimitError
	if err == nil || !errors.As(err, &as) {
		t.Fatalf("expected RateLimitError, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected single attempt on rate limit, got %d", calls)
	}
}

func TestDoEsiWithRetry_PassesVerbAndBody(t *testing.T) {
	ctx := context.Background()
	var gotMethod string
	var gotBody []byte
	client := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, group esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			gotMethod = method
			gotBody = append([]byte(nil), body...)
			return []byte("x"), &http.Response{StatusCode: http.StatusOK}, nil
		},
	}
	_, _, err := DoEsiWithRetry(ctx, client, 4, http.MethodGet, "/status/", map[string]string{"Accept": "application/json"}, nil, esiratelimiter.GroupDesignation{PrimaryGroup: "status"})
	if err != nil {
		t.Fatal(err)
	}
	if gotMethod != http.MethodGet {
		t.Fatalf("method: %q", gotMethod)
	}
	if gotBody != nil {
		t.Fatalf("expected nil body for GET, got %q", gotBody)
	}
}

func TestDoEsiPostWithRetry_InvokesDoWithPost(t *testing.T) {
	ctx := context.Background()
	var gotMethod, gotPath string
	var gotBody []byte
	client := &mockESIClient{
		doFunc: func(ctx context.Context, method, path string, headers map[string]string, body []byte, group esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
			gotMethod = method
			gotPath = path
			gotBody = append([]byte(nil), body...)
			return []byte("{}"), &http.Response{StatusCode: http.StatusOK}, nil
		},
	}
	body, resp, err := DoEsiPostWithRetry(ctx, client, 4, "/characters/affiliation/?datasource=tranquility", map[string]string{"Content-Type": "application/json"}, []byte(`[1]`), esiratelimiter.GroupDesignation{})
	if err != nil {
		t.Fatal(err)
	}
	if gotMethod != http.MethodPost {
		t.Fatalf("method: want POST, got %q", gotMethod)
	}
	if gotPath != "/characters/affiliation/?datasource=tranquility" {
		t.Fatalf("path: %q", gotPath)
	}
	if string(gotBody) != `[1]` {
		t.Fatalf("body: %q", gotBody)
	}
	if string(body) != "{}" || resp.StatusCode != http.StatusOK {
		t.Fatalf("response mismatch body=%q status=%d", body, resp.StatusCode)
	}
}
