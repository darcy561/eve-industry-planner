package evesso

import (
	"strings"
	"testing"

	"eve-industry-planner/shared/jsoncodec"
)

// SSO responses are CCP's to shape, not ours. A field we do not declare has to
// be ignored rather than refused: CCP adds one without asking, and a decoder
// that rejected it would turn an ordinary upstream release into a failed login.
func TestSSOResponsesTolerateCCPAddingFields(t *testing.T) {
	t.Parallel()

	body := `{"access_token":"tok","token_type":"Bearer","expires_in":1199,` +
		`"refresh_token":"ref","a_field_ccp_added_later":{"nested":true}}`

	var payload EveSSOTokenPayload
	if err := jsoncodec.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatalf("an unrecognised field must not refuse the token: %v", err)
	}
	if payload.AccessToken != "tok" || payload.ExpiresIn != 1199 || payload.RefreshToken != "ref" {
		t.Fatalf("decoded %+v", payload)
	}

	var metadata struct {
		JWKSUri string `json:"jwks_uri"`
	}
	if err := jsoncodec.Decode(strings.NewReader(`{"jwks_uri":"https://example.invalid/jwks","issuer":"x"}`), &metadata); err != nil {
		t.Fatalf("Decode is the lenient path and must accept extra members: %v", err)
	}
	if metadata.JWKSUri == "" {
		t.Fatal("jwks_uri was not read")
	}

	// The key set is the likeliest of the three to grow a field: CCP can add key
	// metadata, and a rotation that did so must not stop the JWKS being read.
	var keys JWKSet
	err := jsoncodec.Decode(strings.NewReader(
		`{"keys":[{"kty":"RSA","kid":"k1","use":"sig","alg":"RS256","n":"AQ","e":"AQAB","x5c":["cert"]}],"extra":1}`,
	), &keys)
	if err != nil {
		t.Fatalf("an added key field must not stop the key set being read: %v", err)
	}
	if len(keys.Keys) != 1 || keys.Keys[0].Kid != "k1" || keys.Keys[0].N != "AQ" {
		t.Fatalf("decoded %+v", keys)
	}
}

// The field names are fixed by OAuth2 and the JWK spec rather than chosen by
// CCP, which is what makes exact-case matching safe here.
func TestSSOFieldNamesMatchExactly(t *testing.T) {
	t.Parallel()

	var payload EveSSOTokenPayload
	if err := jsoncodec.Unmarshal([]byte(`{"Access_Token":"tok"}`), &payload); err != nil {
		t.Fatalf("a miscased member is unknown, not an error: %v", err)
	}
	if payload.AccessToken != "" {
		t.Fatal("a miscased field must not fill the token — the spec fixes the casing, so this would be a different field")
	}
}
