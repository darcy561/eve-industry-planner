package ratelimiter

import (
	"testing"
)

func TestBuildGroupNameFromDesignation(t *testing.T) {
	tests := []struct {
		name        string
		designation GroupDesignation
		want        string
	}{
		{
			name: "primary only",
			designation: GroupDesignation{
				PrimaryGroup:   "markets",
				SecondaryGroup: "",
			},
			want: "markets",
		},
		{
			name: "primary and secondary",
			designation: GroupDesignation{
				PrimaryGroup:   "markets",
				SecondaryGroup: "prices",
			},
			want: "markets-prices",
		},
		{
			name: "empty primary",
			designation: GroupDesignation{
				PrimaryGroup:   "",
				SecondaryGroup: "prices",
			},
			want: "-prices",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildGroupNameFromDesignation(tt.designation)
			if got != tt.want {
				t.Errorf("buildGroupNameFromDesignation() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetTokensForStatus(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		want       int
	}{
		{
			name:       "2XX success",
			statusCode: 200,
			want:       2,
		},
		{
			name:       "2XX created",
			statusCode: 201,
			want:       2,
		},
		{
			name:       "3XX redirect",
			statusCode: 301,
			want:       1,
		},
		{
			name:       "3XX not modified",
			statusCode: 304,
			want:       1,
		},
		{
			name:       "4XX bad request",
			statusCode: 400,
			want:       5,
		},
		{
			name:       "4XX not found",
			statusCode: 404,
			want:       5,
		},
		{
			name:       "4XX rate limit",
			statusCode: 429,
			want:       5,
		},
		{
			name:       "5XX server error",
			statusCode: 500,
			want:       0,
		},
		{
			name:       "5XX service unavailable",
			statusCode: 503,
			want:       0,
		},
		{
			name:       "status code >= 500",
			statusCode: 999,
			want:       0, // Status codes >= 500 return 0
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getTokensForStatus(tt.statusCode)
			if got != tt.want {
				t.Errorf("getTokensForStatus(%d) = %v, want %v", tt.statusCode, got, tt.want)
			}
		})
	}
}

func TestParseTokenLimitFromHeader(t *testing.T) {
	tests := []struct {
		name     string
		limitStr string
		want     int
		wantOk   bool
	}{
		{
			name:     "standard format 600/15m",
			limitStr: "600/15m",
			want:     600,
			wantOk:   true,
		},
		{
			name:     "standard format 150/15m",
			limitStr: "150/15m",
			want:     150,
			wantOk:   true,
		},
		{
			name:     "with spaces",
			limitStr: " 600 /15m",
			want:     600,
			wantOk:   true,
		},
		{
			name:     "plain integer",
			limitStr: "1000",
			want:     1000,
			wantOk:   true,
		},
		{
			name:     "plain integer with spaces",
			limitStr: " 1000 ",
			want:     1000,
			wantOk:   true,
		},
		{
			name:     "empty string",
			limitStr: "",
			want:     0,
			wantOk:   false,
		},
		{
			name:     "invalid format",
			limitStr: "invalid",
			want:     0,
			wantOk:   false,
		},
		{
			name:     "only slash",
			limitStr: "/15m",
			want:     0,
			wantOk:   false,
		},
		{
			name:     "non-numeric prefix",
			limitStr: "abc/15m",
			want:     0,
			wantOk:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, gotOk := parseTokenLimitFromHeader(tt.limitStr)
			if got != tt.want {
				t.Errorf("parseTokenLimitFromHeader() got = %v, want %v", got, tt.want)
			}
			if gotOk != tt.wantOk {
				t.Errorf("parseTokenLimitFromHeader() gotOk = %v, want %v", gotOk, tt.wantOk)
			}
		})
	}
}
