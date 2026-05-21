package sso

import "testing"

func TestIsSSOGrantClientError(t *testing.T) {
	t.Parallel()
	clientErrors := []string{
		"eve sso error: invalid_grant: refresh token is invalid.",
		"eve sso error: refresh token is invalid.",
		"eve sso error: invalid refresh token. token missing/expired.",
		"eve sso error: authorization code is invalid.",
	}
	for _, msg := range clientErrors {
		if !isSSOGrantClientError(msg) {
			t.Fatalf("expected client error for %q", msg)
		}
	}
	if isSSOGrantClientError("eve sso error: server error (status 503)") {
		t.Fatal("expected upstream server error not to be classified as client error")
	}
}
