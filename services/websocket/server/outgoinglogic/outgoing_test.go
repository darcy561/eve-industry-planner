package outgoinglogic

import "testing"

func TestShouldSuppressRecipient(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name         string
		srcSession   string
		srcClient    string
		recvSession  string
		recvClient   string
		wantSuppress bool
	}{
		{
			name:       "client match suppresses only originating tab",
			srcSession: "sess-a", srcClient: "0xabc",
			recvSession: "sess-a", recvClient: "0xabc",
			wantSuppress: true,
		},
		{
			name:       "same session different client delivers",
			srcSession: "sess-a", srcClient: "0xabc",
			recvSession: "sess-a", recvClient: "0xdef",
			wantSuppress: false,
		},
		{
			name:       "empty source client falls back to session suppress",
			srcSession: "sess-a", srcClient: "",
			recvSession: "sess-a", recvClient: "0xdef",
			wantSuppress: true,
		},
		{
			name:       "legacy session-only different session delivers",
			srcSession: "sess-a", srcClient: "",
			recvSession: "sess-b", recvClient: "0xdef",
			wantSuppress: false,
		},
		{
			name:       "no source identifiers never suppresses",
			srcSession: "", srcClient: "",
			recvSession: "sess-a", recvClient: "0xabc",
			wantSuppress: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := ShouldSuppressRecipient(tt.srcSession, tt.srcClient, tt.recvSession, tt.recvClient)
			if got != tt.wantSuppress {
				t.Fatalf("ShouldSuppressRecipient(...) = %v, want %v", got, tt.wantSuppress)
			}
		})
	}
}
