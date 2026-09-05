package objectstore

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func testDialConfig(endpoint string) dialConfig {
	return dialConfig{
		Endpoint:  endpoint,
		AccessKey: "test-access",
		SecretKey: "test-secret",
		Bucket:    BucketStaticDataTest,
	}
}

func TestDialS3RetriesUntilStoreAccepts(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		if r.URL.Query().Has("location") {
			w.Header().Set("Content-Type", "application/xml")
			_, _ = w.Write([]byte(`<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>`))
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	b, err := dialS3(ctx, testDialConfig(srv.URL))
	if err != nil {
		t.Fatalf("dialS3: %v", err)
	}
	if b == nil {
		t.Fatal("dialS3 returned no backend")
	}
	if got := calls.Load(); got < 3 {
		t.Fatalf("expected at least 3 attempts, got %d", got)
	}
}

func TestDialS3ReturnsErrorWhenStoreStaysDown(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if _, err := dialS3(ctx, testDialConfig(srv.URL)); err == nil {
		t.Fatal("expected an error when the object store never answers")
	}
}

func TestDialS3StopsOnContextCancel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, err := dialS3(ctx, testDialConfig(srv.URL))
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "context deadline exceeded") {
		t.Fatalf("expected the context error, got %v", err)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("dial kept retrying past cancellation: %s", elapsed)
	}
}
