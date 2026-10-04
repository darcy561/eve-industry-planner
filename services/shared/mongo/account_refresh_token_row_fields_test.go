package mongo

import (
	"testing"

	"eve-industry-planner/shared/models"
)

func TestRefreshTokenRowFields(t *testing.T) {
	const prefix = "refreshTokens.$."

	t.Run("an encrypted row writes its material and drops legacy plaintext", func(t *testing.T) {
		set, unset := refreshTokenRowFields(models.RefreshToken{
			CharacterHash:      "a",
			RTokenCiphertext:   "ct",
			RTokenNonce:        "nonce",
			RTokenKeyVersion:   "v2",
			TokenFormatVersion: 3,
		})

		for field, want := range map[string]any{
			prefix + "rTokenCiphertext":   "ct",
			prefix + "rTokenNonce":        "nonce",
			prefix + "rTokenKeyVersion":   "v2",
			prefix + "tokenFormatVersion": 3,
		} {
			if set[field] != want {
				t.Errorf("set[%s] = %v, want %v", field, set[field], want)
			}
		}
		if _, ok := unset[prefix+"rToken"]; !ok {
			t.Error("legacy plaintext was not unset beside the ciphertext")
		}
	})

	t.Run("a counter-only row leaves material untouched", func(t *testing.T) {
		set, unset := refreshTokenRowFields(models.RefreshToken{
			CharacterHash:             "a",
			CloudMaintRefreshFailures: 1,
		})

		for _, field := range []string{"rTokenCiphertext", "rTokenNonce", "rTokenKeyVersion", "rToken"} {
			if _, ok := set[prefix+field]; ok {
				t.Errorf("set carries %s for a row holding no material", field)
			}
		}
		if _, ok := unset[prefix+"rToken"]; ok {
			t.Error("unset would clear plaintext material the caller did not replace")
		}
		if set[prefix+"cloudMaintRefreshFailures"] != 1 {
			t.Errorf("failure count = %v, want 1", set[prefix+"cloudMaintRefreshFailures"])
		}
	})

	t.Run("a legacy plaintext row keeps its plaintext", func(t *testing.T) {
		set, unset := refreshTokenRowFields(models.RefreshToken{CharacterHash: "a", RToken: "plain"})

		if set[prefix+"rToken"] != "plain" {
			t.Errorf("rToken = %v, want the plaintext written", set[prefix+"rToken"])
		}
		if _, ok := unset[prefix+"rToken"]; ok {
			t.Error("the row's own plaintext was unset")
		}
	})

	t.Run("a cleared failure count is unset, not stored as zero", func(t *testing.T) {
		set, unset := refreshTokenRowFields(models.RefreshToken{
			CharacterHash:             "a",
			RTokenCiphertext:          "ct",
			CloudMaintRefreshFailures: 0,
		})

		if _, ok := set[prefix+"cloudMaintRefreshFailures"]; ok {
			t.Error("a zero failure count was written rather than removed")
		}
		if _, ok := unset[prefix+"cloudMaintRefreshFailures"]; !ok {
			t.Error("a zero failure count was neither written nor removed")
		}
	})
}
