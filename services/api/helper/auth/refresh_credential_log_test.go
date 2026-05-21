package auth

import (
	"net/http"
	"testing"
)

func TestBuildRefreshCredentialLogDetail(t *testing.T) {
	t.Parallel()

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/auth/sessions/rotate", nil)
	req.AddCookie(&http.Cookie{Name: AppSessionCookieName, Value: "sess-abc"})
	req.AddCookie(&http.Cookie{Name: AppRefreshCookieName, Value: "00000000-0000-4000-8000-00000000abcd"})

	d := BuildRefreshCredentialLogDetail(req, "sessions_rotate", "00000000-0000-4000-8000-00000000abcd", true, "")
	if d.CredentialSource != "eip_app_refresh_cookie" {
		t.Fatalf("source = %q", d.CredentialSource)
	}
	if d.RefreshTokenIDHint != "0000abcd" {
		t.Fatalf("hint = %q", d.RefreshTokenIDHint)
	}
	if !d.HasEipSessionCookie || !d.HasEipAppRefreshCookie {
		t.Fatal("expected session and app refresh cookies detected")
	}
	if d.LikelyCause == "" {
		t.Fatal("expected likely cause")
	}
}
