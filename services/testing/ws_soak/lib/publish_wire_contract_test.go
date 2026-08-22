package soaklib

import (
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

// The harness measures nothing if it publishes keys the websocket does not read.
// This decodes a published payload with the server's own decoder, so a rename on
// either side fails here rather than as a silently empty fan-out.
func TestPublishedFanoutPayloadDecodesAsTheServerReadsIt(t *testing.T) {
	t.Setenv("ENTITY_ID_KEY", "0123456789abcdef0123456789abcdef")

	corpRef := CorporationRef(98000001)
	allyRef := AllianceRef(99000001)

	for _, tc := range []struct {
		name string
		msg  DocUpdate
		want func(t *testing.T, d outgoinglogic.DecodedOutbound)
	}{
		{
			name: "account",
			msg:  DocUpdate{AccountID: "acct-1"},
			want: func(t *testing.T, d outgoinglogic.DecodedOutbound) {
				if d.Route.AccountID != "acct-1" {
					t.Fatalf("accountID = %q", d.Route.AccountID)
				}
			},
		},
		{
			name: "corporation",
			msg:  DocUpdate{CorporationRef: corpRef},
			want: func(t *testing.T, d outgoinglogic.DecodedOutbound) {
				if d.Route.CorporationRef != corpRef {
					t.Fatalf("corporationRef = %q, want %q", d.Route.CorporationRef, corpRef)
				}
			},
		},
		{
			name: "alliance",
			msg:  DocUpdate{AllianceRef: allyRef},
			want: func(t *testing.T, d outgoinglogic.DecodedOutbound) {
				if d.Route.AllianceRef != allyRef {
					t.Fatalf("allianceRef = %q, want %q", d.Route.AllianceRef, allyRef)
				}
			},
		},
		{
			name: "alliance narrowed to a corporation",
			msg:  DocUpdate{AllianceRef: allyRef, ScopeCorporationRefs: []string{corpRef}},
			want: func(t *testing.T, d outgoinglogic.DecodedOutbound) {
				if len(d.Scopes.CorporationRefs) != 1 || d.Scopes.CorporationRefs[0] != corpRef {
					t.Fatalf("downward corporation scope = %+v, want [%s]", d.Scopes, corpRef)
				}
			},
		},
		{
			name: "narrowed to accounts",
			msg:  DocUpdate{CorporationRef: corpRef, ScopeAccountIDs: []string{"a1", "a2"}},
			want: func(t *testing.T, d outgoinglogic.DecodedOutbound) {
				if len(d.Scopes.AccountIDs) != 2 {
					t.Fatalf("downward account scope = %+v", d.Scopes)
				}
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			payload, err := marshalFanoutPayload("subj", "coll", "doc-1", tc.msg)
			if err != nil {
				t.Fatalf("marshalFanoutPayload: %v", err)
			}
			decoded, err := outgoinglogic.DecodeOutboundMessage(payload)
			if err != nil {
				t.Fatalf("the server could not decode the published payload: %v\n%s", err, payload)
			}
			tc.want(t, decoded)
		})
	}
}

// Org routing values on the wire must be refs. A raw id would never match a
// client's granted refs, so the lane would deliver to nobody.
func TestPublishedOrgRoutingValuesAreRefs(t *testing.T) {
	t.Setenv("ENTITY_ID_KEY", "0123456789abcdef0123456789abcdef")

	topo, err := buildFanoutTopology(80, 0, 0, 0)
	if err != nil {
		t.Fatalf("buildFanoutTopology: %v", err)
	}
	jobs, err := buildFanoutJobs(topo, 128)
	if err != nil {
		t.Fatalf("buildFanoutJobs: %v", err)
	}
	for i, job := range jobs {
		for name, value := range map[string]string{
			"CorporationRef": job.CorporationRef,
			"AllianceRef":    job.AllianceRef,
		} {
			if value == "" {
				continue
			}
			if !entityid.ValidShape(value) {
				t.Fatalf("job %d %s = %q, which is not a ref", i, name, value)
			}
		}
		for _, ref := range job.ScopeCorporationRefs {
			if !entityid.ValidShape(ref) {
				t.Fatalf("job %d downward scope %q is not a ref", i, ref)
			}
		}
	}
}
