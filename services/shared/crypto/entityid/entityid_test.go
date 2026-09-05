package entityid

import (
	"bytes"
	"encoding/base64"
	"strings"
	"testing"
)

func testCipher(t *testing.T) *Cipher {
	t.Helper()
	c, err := New(bytes.Repeat([]byte{7}, 32))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestRoundTrip(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	for _, kind := range []string{KindCharacter, KindCorp, KindAlliance} {
		value, err := c.Encrypt(kind, 98765432)
		if err != nil {
			t.Fatalf("Encrypt(%s): %v", kind, err)
		}
		gotKind, gotID, err := c.Decrypt(value)
		if err != nil {
			t.Fatalf("Decrypt(%s): %v", kind, err)
		}
		if gotKind != kind || gotID != 98765432 {
			t.Fatalf("round trip = (%q, %d), want (%q, 98765432)", gotKind, gotID, kind)
		}
	}
}

// The property the whole design turns on: encrypting the same id twice must
// produce the same value, or nothing can be queried by it.
func TestEncryptIsDeterministic(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	first, err := c.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}
	for range 16 {
		again, err := c.Corporation(98765432)
		if err != nil {
			t.Fatalf("Corporation: %v", err)
		}
		if again != first {
			t.Fatalf("value = %q, want %q on every call", again, first)
		}
	}
}

// A separately constructed cipher over the same secret must agree, since values
// are compared across services.
func TestValuesAgreeAcrossCipherInstances(t *testing.T) {
	t.Parallel()
	a := testCipher(t)
	b := testCipher(t)

	want, err := a.Corporation(1000169)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}
	got, err := b.Corporation(1000169)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}
	if got != want {
		t.Fatalf("value = %q, want %q", got, want)
	}
}

func TestDistinctIDsProduceDistinctValues(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	seen := make(map[string]int64, 512)
	for id := int64(1); id <= 512; id++ {
		value, err := c.Corporation(id)
		if err != nil {
			t.Fatalf("Corporation(%d): %v", id, err)
		}
		if prev, clash := seen[value]; clash {
			t.Fatalf("ids %d and %d share value %q", prev, id, value)
		}
		seen[value] = id
	}
}

// The kind is bound into both the nonce and the AEAD's additional data, so one
// numeric id must not produce the same value under two kinds.
func TestKindsAreSeparated(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	corp, err := c.Corporation(4242)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}
	char, err := c.Character(4242)
	if err != nil {
		t.Fatalf("Character: %v", err)
	}
	if corp == char {
		t.Fatal("the same id must not produce one value across kinds")
	}

	_, corpToken, _ := split(corp)
	if _, _, err := c.Decrypt(KindCharacter + "_" + corpToken); err == nil {
		t.Fatal("a corporation value must not decrypt as a character")
	}
}

func TestDifferentSecretsDoNotInterchange(t *testing.T) {
	t.Parallel()
	c := testCipher(t)
	other, err := New(bytes.Repeat([]byte{9}, 32))
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	value, err := c.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}
	if same, err := other.Corporation(98765432); err == nil && same == value {
		t.Fatal("two secrets must not produce the same value")
	}
	if _, _, err := other.Decrypt(value); err == nil {
		t.Fatal("a value must not decrypt under a different secret")
	}
}

// A value assembled from a valid nonce and a different id's ciphertext must be
// rejected: the nonce is bound to the plaintext it derives from.
func TestTransplantedNonceIsRejected(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	one, _ := c.Corporation(1111)
	two, _ := c.Corporation(2222)
	_, tokenOne, _ := split(one)
	_, tokenTwo, _ := split(two)

	rawOne, err := base64.RawURLEncoding.DecodeString(tokenOne)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	rawTwo, err := base64.RawURLEncoding.DecodeString(tokenTwo)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	nonceSize := c.aead.NonceSize()
	spliced := append(append([]byte(nil), rawOne[:nonceSize]...), rawTwo[nonceSize:]...)
	if _, _, err := c.Decrypt(KindCorp + "_" + base64.RawURLEncoding.EncodeToString(spliced)); err == nil {
		t.Fatal("a value carrying another id's ciphertext must not decrypt")
	}
}

func TestTamperedCiphertextIsRejected(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	value, _ := c.Corporation(98765432)
	kind, token, _ := split(value)
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	raw[len(raw)-1] ^= 0xFF

	if _, _, err := c.Decrypt(kind + "_" + base64.RawURLEncoding.EncodeToString(raw)); err == nil {
		t.Fatal("a tampered value must not decrypt")
	}
}

func TestDecryptKindRejectsTheWrongKind(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	value, _ := c.Corporation(98765432)
	if _, err := c.DecryptKind(KindCorp, value); err != nil {
		t.Fatalf("DecryptKind(corp): %v", err)
	}
	if _, err := c.DecryptKind(KindAlliance, value); err == nil {
		t.Fatal("expected an error when the value is not the wanted kind")
	}
}

func TestEncryptRejectsBadInput(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	if _, err := c.Encrypt("station", 1); err == nil {
		t.Fatal("expected an error for an unknown kind")
	}
	for _, id := range []int64{0, -1} {
		if _, err := c.Encrypt(KindCorp, id); err == nil {
			t.Fatalf("expected an error for id %d", id)
		}
	}
	var nilCipher *Cipher
	if _, err := nilCipher.Corporation(1); err == nil {
		t.Fatal("expected an error on a nil cipher")
	}
}

func TestNewRejectsAShortSecret(t *testing.T) {
	t.Parallel()
	if _, err := New(bytes.Repeat([]byte{1}, minSecretBytes-1)); err == nil {
		t.Fatal("expected an error for a short secret")
	}
	if _, err := New(nil); err == nil {
		t.Fatal("expected an error for an empty secret")
	}
}

func TestDecryptRejectsMalformedValues(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	for _, value := range []string{
		"", "corp", "corp_", "_token", "station_abc",
		"corp_not!base64", "corp_" + base64.RawURLEncoding.EncodeToString([]byte("short")),
	} {
		if _, _, err := c.Decrypt(value); err == nil {
			t.Fatalf("expected an error for %q", value)
		}
	}
}

// Shape checks are used where no key is available, so they must not need one.
func TestShapeHelpersNeedNoKey(t *testing.T) {
	t.Parallel()
	c := testCipher(t)
	value, _ := c.Alliance(99005338)

	if kind, ok := ParseKind(value); !ok || kind != KindAlliance {
		t.Fatalf("ParseKind = (%q, %v)", kind, ok)
	}
	if !ValidShape(value) {
		t.Fatal("ValidShape must accept a produced value")
	}
	for _, bad := range []string{"", "corp", "corp_", "station_abc", "corp_has spaces", "corp_has+plus"} {
		if ValidShape(bad) {
			t.Fatalf("ValidShape must reject %q", bad)
		}
	}
}

// Values are used as tenant keys and log fields, so the raw id must not be
// recoverable by reading one.
func TestValueDoesNotContainTheRawID(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	value, err := c.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}
	if strings.Contains(value, "98765432") {
		t.Fatalf("value %q leaks the raw id", value)
	}
	if !strings.HasPrefix(value, KindCorp+"_") {
		t.Fatalf("value %q must carry its kind as a readable prefix", value)
	}
}
