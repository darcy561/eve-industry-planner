package evesso

import "testing"

func TestFormatEveSSOClientError(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		in   EveSSOErrorResponse
		want string
	}{
		{
			name: "invalid_grant with description",
			in: EveSSOErrorResponse{
				Error:            "invalid_grant",
				ErrorDescription: "Refresh token is invalid.",
			},
			want: "EVE SSO Error: invalid_grant: Refresh token is invalid.",
		},
		{
			name: "description only",
			in: EveSSOErrorResponse{
				ErrorDescription: "Refresh token is invalid.",
			},
			want: "EVE SSO Error: Refresh token is invalid.",
		},
		{
			name: "error only",
			in: EveSSOErrorResponse{
				Error: "invalid_grant",
			},
			want: "EVE SSO Error: invalid_grant",
		},
		{
			name: "empty",
			in:   EveSSOErrorResponse{},
			want: "",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := formatEveSSOClientError(tc.in); got != tc.want {
				t.Fatalf("formatEveSSOClientError() = %q, want %q", got, tc.want)
			}
		})
	}
}
