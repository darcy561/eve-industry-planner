package auth

import "testing"

const (
	testCorpRefValue     = "corp_56_J_DzQdPpjXwi9Xtp3C8bri9Bfi0Z94qUulkbKCac"
	testAllianceRefValue = "alliance_DWc0i6y_cTAGa4QSZWC0S94Zm7vUclxiUNHlNPthzvc"
)

func TestFormatTenantAffinityKey(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name                    string
		account, corp, alliance string
		want                    string
	}{
		{name: "account only", account: "acct1", want: "account:acct1"},
		{name: "corp over account", account: "acct1", corp: testCorpRefValue, want: "corporation:" + testCorpRefValue},
		{name: "alliance wins", account: "acct1", corp: testCorpRefValue, alliance: testAllianceRefValue, want: "alliance:" + testAllianceRefValue},
		{name: "trim whitespace", account: "  acct1  ", want: "account:acct1"},
		{name: "empty", want: ""},
		{name: "blank alliance falls to corp", corp: testCorpRefValue, alliance: "  ", want: "corporation:" + testCorpRefValue},
		// The cookie is client-visible, so a raw entity id must never reach it.
		{name: "raw corporation id is refused", account: "acct1", corp: "98765432", want: "account:acct1"},
		{name: "raw alliance id is refused", account: "acct1", alliance: "99000001", want: "account:acct1"},
		{name: "wrong kind is refused", account: "acct1", corp: testAllianceRefValue, want: "account:acct1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := FormatTenantAffinityKey(tc.account, tc.corp, tc.alliance)
			if got != tc.want {
				t.Fatalf("FormatTenantAffinityKey(%q,%q,%q)=%q want %q", tc.account, tc.corp, tc.alliance, got, tc.want)
			}
		})
	}
}
