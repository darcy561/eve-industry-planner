package wsplacement

import "testing"

func TestTenantKeys(t *testing.T) {
	t.Parallel()
	if TenantKeyAccount("  a1  ") != "account:a1" {
		t.Fatal("account")
	}
	if TenantKeyCorporation("c9") != "corporation:c9" {
		t.Fatal("corp")
	}
	if TenantKeyAlliance("all2") != "alliance:all2" {
		t.Fatal("alliance")
	}
	if TenantKeyAccount("") != "" || TenantKeyCorporation("  ") != "" {
		t.Fatal("empty")
	}
}
