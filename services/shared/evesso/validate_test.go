package evesso_test

import (
	"testing"

	"eve-industry-planner/shared/evesso"
	"eve-industry-planner/testing/evessofake"
)

const testClientID = "test-eve-client-id"

// The fake signs with a real RSA key it publishes through JWKS, so these run
// the production path whole: fetch metadata, fetch keys, find the kid, verify
// the signature, then check issuer and audience.

func TestATokenFromSSOVerifies(t *testing.T) {
	sso := evessofake.Start(t, testClientID)
	sso.SetCharacter(evessofake.Character{ID: "91316135", Name: "Test Pilot", Hash: "owner-hash"})

	claims, err := evesso.ValidateEveSSOToken(sso.AccessToken(), testClientID)
	if err != nil {
		t.Fatalf("a token EVE SSO just minted did not validate: %v", err)
	}
	if claims.CharacterID != "91316135" {
		t.Errorf("CharacterID = %q, want it read out of the subject", claims.CharacterID)
	}
	if claims.Owner != "owner-hash" {
		t.Errorf("Owner = %q, want the character hash", claims.Owner)
	}
}

func TestATokenSignedByAnotherKeyIsRejected(t *testing.T) {
	// Well-formed, right issuer, right audience, right kid — and signed with a
	// key JWKS never published. Only the signature check catches this.
	sso := evessofake.Start(t, testClientID)

	if _, err := evesso.ValidateEveSSOToken(sso.TokenSignedByAnother(), testClientID); err == nil {
		t.Fatal("a token signed by an unpublished key was accepted")
	}
}

func TestAnExpiredTokenIsRejected(t *testing.T) {
	sso := evessofake.Start(t, testClientID)

	if _, err := evesso.ValidateEveSSOToken(sso.ExpiredAccessToken(), testClientID); err == nil {
		t.Fatal("an expired token was accepted")
	}
}

func TestATokenForAnotherApplicationIsRejected(t *testing.T) {
	// The audience must carry this application's client id, so a token minted
	// for a different one must not open a session here.
	sso := evessofake.Start(t, "someone-elses-client-id")

	if _, err := evesso.ValidateEveSSOToken(sso.AccessToken(), testClientID); err == nil {
		t.Fatal("a token issued to another application was accepted")
	}
}
