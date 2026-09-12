package conversion

import "strings"

// OutputLocale is the SDE name language the published files carry.
//
// Every SDE name is an object keyed by language — de, en, es, fr, ja, ko, ru, zh
// — and the published files hold one of them. Building a second language pack is
// this constant plus a per-locale output path; the readers do not change.
const OutputLocale = "en"

// isExpiredType is true for a type CCP marks as expired in its name.
//
// Matched against the English name whatever locale the output carries: the marker
// is CCP's own wording, and it is not translated in the other name fields.
func isExpiredType(itemData map[string]any) bool {
	nameObj, ok := itemData["name"].(map[string]any)
	if !ok {
		return false
	}
	name, ok := nameObj["en"].(string)
	if !ok {
		return false
	}
	return strings.Contains(name, "expired") || strings.Contains(name, "Expired")
}

// localisedName reads the name in OutputLocale from an SDE row's name object.
func localisedName(row map[string]any) (string, bool) {
	nameObj, ok := row["name"].(map[string]any)
	if !ok {
		return "", false
	}
	name, ok := nameObj[OutputLocale].(string)
	if !ok || name == "" {
		return "", false
	}
	return name, true
}
