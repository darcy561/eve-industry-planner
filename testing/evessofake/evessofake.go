// Package evessofake serves a stand-in for EVE SSO: the OAuth token endpoint,
// the authorization-server metadata document, and a JWKS holding a real RSA key.
//
// Access tokens are genuinely signed and genuinely verifiable, so a test
// exercises the same JWT parsing, key lookup, issuer and audience checks the
// live path runs. A stub that returned a fixed string would prove none of that.
package evessofake

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Issuer is what EVE SSO puts in the iss claim. It is a name rather than a
// address, so a fake on localhost still asserts it.
const Issuer = "login.eveonline.com"

// Audience is the fixed half of the aud claim; the other half is the client id.
const Audience = "EVE Online"

const keyID = "fake-sso-key"

// Character is who a minted token belongs to.
type Character struct {
	ID   string
	Name string
	Hash string
}

// Server is a fake EVE SSO. Point EVE_SSO_BASE_URL at URL and the production
// code paths reach it without knowing.
type Server struct {
	URL      string
	ClientID string

	t   testing.TB
	key *rsa.PrivateKey
	srv *httptest.Server

	mu sync.Mutex
	// exchanges counts token-endpoint calls by grant type.
	exchanges map[string]int
	// status, when non-zero, is returned instead of a token.
	status int
	// body is the error body returned alongside a non-2xx status.
	body string
	// character is who the next minted token belongs to.
	character Character
	// offline drops the connection instead of answering.
	offline bool
}

// Start brings up a fake bound to t and points EVE_SSO_BASE_URL at it for the
// duration of the test.
func Start(t testing.TB, clientID string) *Server {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate signing key: %v", err)
	}

	s := &Server{
		ClientID:  clientID,
		t:         t,
		key:       key,
		exchanges: map[string]int{},
		character: Character{ID: "91316135", Name: "Test Pilot", Hash: "owner-hash"},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/v2/oauth/token", s.token)
	mux.HandleFunc("/.well-known/oauth-authorization-server", s.metadata)
	mux.HandleFunc("/oauth/jwks", s.jwks)

	s.srv = httptest.NewServer(mux)
	s.URL = s.srv.URL
	t.Cleanup(s.srv.Close)

	t.Setenv("EVE_SSO_BASE_URL", s.URL)
	return s
}

// SetCharacter decides who the next minted token belongs to.
func (s *Server) SetCharacter(c Character) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.character = c
}

// Refuse makes the token endpoint answer status with body until cleared. Use it
// for an OAuth refusal, which is the server answering rather than an outage.
func (s *Server) Refuse(status int, body string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status, s.body = status, body
}

// GoDown stops the fake answering at all, which is what an outage looks like.
func (s *Server) GoDown() {
	s.mu.Lock()
	s.offline = true
	s.mu.Unlock()
}

// ComeBack resumes answering.
func (s *Server) ComeBack() {
	s.mu.Lock()
	s.offline, s.status, s.body = false, 0, ""
	s.mu.Unlock()
}

// Exchanges is how many token requests arrived for a grant type.
func (s *Server) Exchanges(grantType string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.exchanges[grantType]
}

// AccessToken mints a signed token for the current character, as the token
// endpoint would return.
func (s *Server) AccessToken() string {
	s.mu.Lock()
	character := s.character
	s.mu.Unlock()
	return s.sign(character, time.Now().Add(20*time.Minute))
}

// ExpiredAccessToken mints one that expired an hour ago.
func (s *Server) ExpiredAccessToken() string {
	s.mu.Lock()
	character := s.character
	s.mu.Unlock()
	return s.sign(character, time.Now().Add(-time.Hour))
}

// TokenSignedByAnother mints a well-formed token signed with a key the JWKS
// does not publish, which must fail verification rather than parse.
func (s *Server) TokenSignedByAnother() string {
	s.t.Helper()
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		s.t.Fatalf("generate rival key: %v", err)
	}
	s.mu.Lock()
	character := s.character
	s.mu.Unlock()

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, s.claims(character, time.Now().Add(time.Hour)))
	token.Header["kid"] = keyID
	signed, err := token.SignedString(other)
	if err != nil {
		s.t.Fatalf("sign with rival key: %v", err)
	}
	return signed
}

func (s *Server) claims(c Character, expiry time.Time) jwt.MapClaims {
	return jwt.MapClaims{
		"sub":   "CHARACTER:EVE:" + c.ID,
		"name":  c.Name,
		"owner": c.Hash,
		"scp":   []string{"publicData"},
		"iss":   Issuer,
		"aud":   []string{Audience, s.ClientID},
		"exp":   expiry.Unix(),
		"iat":   time.Now().Add(-time.Minute).Unix(),
	}
}

func (s *Server) sign(c Character, expiry time.Time) string {
	s.t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, s.claims(c, expiry))
	token.Header["kid"] = keyID
	signed, err := token.SignedString(s.key)
	if err != nil {
		s.t.Fatalf("sign access token: %v", err)
	}
	return signed
}

func (s *Server) token(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad form", http.StatusBadRequest)
		return
	}
	grant := r.PostForm.Get("grant_type")

	s.mu.Lock()
	s.exchanges[grant]++
	offline, status, body, character := s.offline, s.status, s.body, s.character
	s.mu.Unlock()

	if offline {
		// Closing without a reply is what a caller sees when nothing is there.
		if hijacker, ok := w.(http.Hijacker); ok {
			if conn, _, err := hijacker.Hijack(); err == nil {
				_ = conn.Close()
				return
			}
		}
		http.Error(w, "", http.StatusServiceUnavailable)
		return
	}
	if status != 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token":  s.sign(character, time.Now().Add(20*time.Minute)),
		"refresh_token": "refreshed-" + character.ID,
		"token_type":    "Bearer",
		"expires_in":    1200,
	})
}

func (s *Server) metadata(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"jwks_uri": s.URL + "/oauth/jwks"})
}

func (s *Server) jwks(w http.ResponseWriter, _ *http.Request) {
	pub := s.key.Public().(*rsa.PublicKey)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"keys": []map[string]string{{
			"kty": "RSA",
			"kid": keyID,
			"use": "sig",
			"alg": "RS256",
			"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
			"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
		}},
	})
}
