package wsplacement

import "testing"

const (
	validCorpRef     = "corp_56_J_DzQdPpjXwi9Xtp3C8bri9Bfi0Z94qUulkbKCac"
	validAllianceRef = "alliance_DWc0i6y_cTAGa4QSZWC0S94Zm7vUclxiUNHlNPthzvc"
)

func TestOrgTenantKeysAcceptRefs(t *testing.T) {
	t.Parallel()
	if got, want := TenantKeyCorporation(validCorpRef), TenantPrefixCorporation+validCorpRef; got != want {
		t.Fatalf("corporation key = %q, want %q", got, want)
	}
	if got, want := TenantKeyAlliance(validAllianceRef), TenantPrefixAlliance+validAllianceRef; got != want {
		t.Fatalf("alliance key = %q, want %q", got, want)
	}
}

// The guard exists so an unconverted caller fails visibly instead of routing on a
// raw entity id, which would leak the id into placement and affinity cookies.
func TestOrgTenantKeysRejectRawIDs(t *testing.T) {
	t.Parallel()
	for _, raw := range []string{"98765432", "10", "0", "-1"} {
		if got := TenantKeyCorporation(raw); got != "" {
			t.Fatalf("TenantKeyCorporation(%q) = %q, want empty", raw, got)
		}
		if got := TenantKeyAlliance(raw); got != "" {
			t.Fatalf("TenantKeyAlliance(%q) = %q, want empty", raw, got)
		}
	}
}

// A ref of the wrong kind must not build a key, so a character or alliance ref
// cannot be routed as a corporation.
func TestOrgTenantKeysRejectTheWrongKind(t *testing.T) {
	t.Parallel()
	if got := TenantKeyCorporation(validAllianceRef); got != "" {
		t.Fatalf("alliance ref built a corporation key: %q", got)
	}
	if got := TenantKeyAlliance(validCorpRef); got != "" {
		t.Fatalf("corporation ref built an alliance key: %q", got)
	}
	if got := TenantKeyCorporation("char_abc123"); got != "" {
		t.Fatalf("character ref built a corporation key: %q", got)
	}
}

func TestOrgTenantKeysRejectMalformedRefs(t *testing.T) {
	t.Parallel()
	for _, bad := range []string{"", "   ", "corp_", "corp", "corp_abc=", "corp_abc!", "v1_corp_abc"} {
		if got := TenantKeyCorporation(bad); got != "" {
			t.Fatalf("TenantKeyCorporation(%q) = %q, want empty", bad, got)
		}
	}
}

// Account ids are not entity refs and keep their own shape.
func TestAccountTenantKeyIsUnguarded(t *testing.T) {
	t.Parallel()
	if got, want := TenantKeyAccount("acct-1"), TenantPrefixAccount+"acct-1"; got != want {
		t.Fatalf("account key = %q, want %q", got, want)
	}
	if got := TenantKeyAccount("  "); got != "" {
		t.Fatalf("blank account key = %q, want empty", got)
	}
}

func TestTenantStringFromRoutingPrecedence(t *testing.T) {
	t.Parallel()
	if got := TenantStringFromRouting("acct-1", validCorpRef, validAllianceRef); got != TenantPrefixAccount+"acct-1" {
		t.Fatalf("account should win: %q", got)
	}
	if got := TenantStringFromRouting("", validCorpRef, validAllianceRef); got != TenantPrefixCorporation+validCorpRef {
		t.Fatalf("corporation should win over alliance: %q", got)
	}
	if got := TenantStringFromRouting("", "", validAllianceRef); got != TenantPrefixAlliance+validAllianceRef {
		t.Fatalf("alliance fallback: %q", got)
	}
	if got := TenantStringFromRouting("", "98765432", ""); got != "" {
		t.Fatalf("a raw id must not produce a tenant key: %q", got)
	}
}
