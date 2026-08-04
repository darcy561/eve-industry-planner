package wsplacement

import "strings"

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

// TenantKeyCorporation returns corporation:{id}, or "" if id is empty.
func TenantKeyCorporation(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	return TenantPrefixCorporation + id
}

// TenantKeyAlliance returns alliance:{id}, or "" if id is empty.
func TenantKeyAlliance(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	return TenantPrefixAlliance + id
}
