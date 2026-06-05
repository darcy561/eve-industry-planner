package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAccountStorageLabel(t *testing.T) {
	t.Parallel()
	if AccountStorageLabel(true) != AccountStorageCloud {
		t.Fatal("expected cloud")
	}
	if AccountStorageLabel(false) != AccountStorageLocal {
		t.Fatal("expected local")
	}
}

func TestAccountStorageLabelFromEsiOAuthStorage(t *testing.T) {
	t.Parallel()
	if AccountStorageLabelFromEsiOAuthStorage(EsiOAuthStorageServer) != AccountStorageCloud {
		t.Fatal("expected cloud for server")
	}
	if AccountStorageLabelFromEsiOAuthStorage(EsiOAuthStorageClient) != AccountStorageLocal {
		t.Fatal("expected local for client")
	}
	if AccountStorageLabelFromEsiOAuthStorage("other") != AccountStorageUnknown {
		t.Fatal("expected unknown")
	}
}

func TestAccountStorageLogPhrase(t *testing.T) {
	t.Parallel()
	if AccountStorageLogPhrase(AccountStorageCloud) != "cloud account" {
		t.Fatal(AccountStorageLogPhrase(AccountStorageCloud))
	}
	if AccountStorageLogPhrase(AccountStorageLocal) != "local account" {
		t.Fatal(AccountStorageLogPhrase(AccountStorageLocal))
	}
}

func TestResolveSessionRefreshAccountStorage(t *testing.T) {
	t.Parallel()

	cloud := true
	local := false
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/sessions/rotate", nil)
	req.AddCookie(&http.Cookie{Name: EsiOAuthStorageCookieName, Value: EsiOAuthStorageServer})

	if got := ResolveSessionRefreshAccountStorage(req, &cloud, false, "jwt"); got != AccountStorageCloud {
		t.Fatalf("userCloudAccounts=true: got %q", got)
	}
	if got := ResolveSessionRefreshAccountStorage(req, &local, true, ""); got != AccountStorageLocal {
		t.Fatalf("userCloudAccounts=false: got %q", got)
	}
	if got := ResolveSessionRefreshAccountStorage(req, nil, false, "jwt"); got != AccountStorageCloud {
		t.Fatalf("cookie server: got %q", got)
	}
	reqLocal := httptest.NewRequest(http.MethodPost, "/api/v1/auth/sessions/rotate", nil)
	reqLocal.AddCookie(&http.Cookie{Name: EsiOAuthStorageCookieName, Value: EsiOAuthStorageClient})
	if got := ResolveSessionRefreshAccountStorage(reqLocal, nil, true, ""); got != AccountStorageLocal {
		t.Fatalf("cookie client: got %q", got)
	}
	if got := ResolveSessionRefreshAccountStorage(httptest.NewRequest(http.MethodPost, "/", nil), nil, true, ""); got != AccountStorageCloud {
		t.Fatalf("cookie resume without eve token: got %q", got)
	}
	if got := ResolveSessionRefreshAccountStorage(httptest.NewRequest(http.MethodPost, "/", nil), nil, false, ""); got != AccountStorageLocal {
		t.Fatalf("body refresh token: got %q", got)
	}
}
