package ref

import (
	"testing"

	"eve-industry-planner/shared/core/crypto/authzhmac/helper"
)

func TestParseAndValidateShape(t *testing.T) {
	h, err := helper.New("v2", []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("new helper: %v", err)
	}
	refStr, err := h.RefFromAllianceID(456)
	if err != nil {
		t.Fatalf("alliance ref: %v", err)
	}
	version, kind, ok := ParseRefVersion(refStr)
	if !ok {
		t.Fatalf("ParseRefVersion returned !ok for %q", refStr)
	}
	if version != "v2" || kind != "alliance" {
		t.Fatalf("unexpected parse result: version=%q kind=%q", version, kind)
	}
	if !ValidateRefShape(refStr) {
		t.Fatalf("ValidateRefShape should accept %q", refStr)
	}
	if ValidateRefShape("v2_alliance_bad+token") {
		t.Fatal("ValidateRefShape should reject non-base64url token chars")
	}
}
