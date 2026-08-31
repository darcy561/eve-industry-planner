package nats

import (
	"fmt"
	"strings"
)

// accountTenantPrefix must stay identical to wsplacement.TenantPrefixAccount.
// nats cannot import wsplacement (import cycle via PlacementState).
const accountTenantPrefix = "account:"

// DocUpdateSubject builds doc.update.{tenantString}.{collection}.{docID}.
// Returns "" if any segment is empty after trim.
func DocUpdateSubject(tenantString, collection, docID string) string {
	tenantString = strings.TrimSpace(tenantString)
	collection = strings.TrimSpace(collection)
	docID = strings.TrimSpace(docID)
	if tenantString == "" || collection == "" || docID == "" {
		return ""
	}
	return fmt.Sprintf("%s.%s.%s.%s", SubjectDocUpdate, tenantString, collection, docID)
}

// DocUpdateFilterForTenant returns doc.update.{tenantString}.> for JetStream FilterSubjects.
func DocUpdateFilterForTenant(tenantString string) string {
	tenantString = strings.TrimSpace(tenantString)
	if tenantString == "" {
		return ""
	}
	return fmt.Sprintf("%s.%s.>", SubjectDocUpdate, tenantString)
}

// DocUpdateFiltersForHostedTenants maps HostedTenants keys to update FilterSubjects.
// Empty hosted set → inert (never empty list / never doc.update.>).
func DocUpdateFiltersForHostedTenants(tenants []string) []string {
	out := make([]string, 0, len(tenants))
	for _, t := range tenants {
		if f := DocUpdateFilterForTenant(t); f != "" {
			out = append(out, f)
		}
	}
	out = NormalizeFilterSubjects(out)
	if len(out) == 0 {
		return []string{DocUpdateFilterInert}
	}
	return out
}

// DocLockFiltersForHostedTenants maps hosted account:{id} → doc.lock.{id}.
// Corp/alliance lock selectivity waits on doc-lock tenantString cutover.
// Empty account hosts → inert.
func DocLockFiltersForHostedTenants(tenants []string) []string {
	out := make([]string, 0, len(tenants))
	for _, t := range tenants {
		t = strings.TrimSpace(t)
		if !strings.HasPrefix(t, accountTenantPrefix) {
			continue
		}
		id := strings.TrimSpace(strings.TrimPrefix(t, accountTenantPrefix))
		if id == "" {
			continue
		}
		out = append(out, fmt.Sprintf("%s.%s", SubjectDocLock, id))
	}
	out = NormalizeFilterSubjects(out)
	if len(out) == 0 {
		return []string{DocLockFilterInert}
	}
	return out
}

// CollectionScopedDocID joins collection and docID the way outbound logging/shard keys expect
// (legacy subject tail after doc.update. was {collection}.{docID}).
func CollectionScopedDocID(collection, docID string) string {
	collection = strings.TrimSpace(collection)
	docID = strings.TrimSpace(docID)
	if collection == "" || docID == "" {
		return ""
	}
	return collection + "." + docID
}

// ExtractIDFromSubject extracts an ID from a NATS subject after a given prefix.
// Subject format: {prefix}.{id} or {prefix}.{nested.id}
// Example: ExtractIDFromSubject("doc.update.user.account123", "doc.update") returns "user.account123"
// Example: ExtractIDFromSubject("doc.subscribe.account123", "doc.subscribe") returns "account123"
// Returns the extracted ID and an error if the subject format is invalid.
func ExtractIDFromSubject(subject string, prefix string) (string, error) {
	// Ensure prefix ends with a dot for proper matching
	prefixWithDot := prefix
	if !strings.HasSuffix(prefix, ".") {
		prefixWithDot = prefix + "."
	}

	// Check if subject starts with prefix
	if !strings.HasPrefix(subject, prefixWithDot) {
		return "", fmt.Errorf("subject does not match prefix: subject=%s, prefix=%s", subject, prefix)
	}

	// Extract the ID part (everything after prefix.)
	id := strings.TrimPrefix(subject, prefixWithDot)
	if id == "" {
		return "", fmt.Errorf("subject has no ID after prefix: subject=%s, prefix=%s", subject, prefix)
	}

	return id, nil
}
