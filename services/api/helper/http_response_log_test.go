package helper

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.mongodb.org/mongo-driver/mongo"
)

func TestRespondEndpointError_contextCanceledDowngrades500(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	RespondEndpointServerError(w, r, "Internal server error", "query failed", "test_failed", "test", context.Canceled, nil)

	if w.Code != http.StatusRequestTimeout {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusRequestTimeout)
	}
	if body := w.Body.String(); body != "Request canceled\n" {
		t.Fatalf("body = %q, want %q", body, "Request canceled\n")
	}
}

func TestRespondEndpointError_realErrorStays500(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	RespondEndpointServerError(w, r, "Internal server error", "query failed", "test_failed", "test", errors.New("mongo down"), nil)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
}

func TestRespondEndpointError_wrappedContextCanceled(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	err := errors.Join(errors.New("mongo find"), context.Canceled)
	RespondEndpointServerError(w, r, "Internal server error", "query failed", "test_failed", "test", err, nil)

	if w.Code != http.StatusRequestTimeout {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusRequestTimeout)
	}
}

func TestRespondEndpointError_redisUnavailableDowngrades500(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	err := fmt.Errorf("an error has occurred with redis command: dial tcp: lookup redis: no such host")
	RespondEndpointServerError(w, r, "Internal server error", "redis get failed", "test_failed", "test", err, nil)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestRespondEndpointError_mongoUnavailableDowngrades500(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	RespondEndpointServerError(w, r, "Internal server error", "mongo find failed", "test_failed", "test", mongo.ErrClientDisconnected, nil)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}
