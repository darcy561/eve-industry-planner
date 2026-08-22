package wsplacement

import (
	"strings"

	"eve-industry-planner/shared/crypto/entityid"
)

// Tenant key prefixes shared by affinity cookies, placement, and websocket hosted-tenant queries.
const (
	TenantPrefixAccount     = "account:"
	TenantPrefixCorporation = "corporation:"
	TenantPrefixAlliance    = "alliance:"
)

// TenantKeyAccount returns account:{id}, or "" if id is empty.
func TenantKeyAccount(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	return TenantPrefixAccount + id
}

// TenantKeyCorporation returns corporation:{corpRef}, or "" when corpRef is not a
// well formed corporation ref.
//
// Organisations are identified internally by ref, never by their EVE id. Rejecting
// anything else means a caller that has not been converted produces an empty key —
// and so fails visibly — rather than routing on a raw id.
func TenantKeyCorporation(corpRef string) string {
	return orgTenantKey(TenantPrefixCorporation, entityid.KindCorp, corpRef)
}

// TenantKeyAlliance returns alliance:{allianceRef}, or "" when allianceRef is not a
// well formed alliance ref.
func TenantKeyAlliance(allianceRef string) string {
	return orgTenantKey(TenantPrefixAlliance, entityid.KindAlliance, allianceRef)
}

func orgTenantKey(prefix, wantKind, entityRef string) string {
	entityRef = strings.TrimSpace(entityRef)
	if entityRef == "" {
		return ""
	}
	kind, ok := entityid.ParseKind(entityRef)
	if !ok || kind != wantKind || !entityid.ValidShape(entityRef) {
		return ""
	}
	return prefix + entityRef
}

// TenantStringFromRouting picks account → corporation → alliance (websocket dispatch precedence).
func TenantStringFromRouting(accountID, corporationRef, allianceRef string) string {
	if k := TenantKeyAccount(accountID); k != "" {
		return k
	}
	if k := TenantKeyCorporation(corporationRef); k != "" {
		return k
	}
	return TenantKeyAlliance(allianceRef)
}
