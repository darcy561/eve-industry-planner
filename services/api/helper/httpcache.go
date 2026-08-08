package helper

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"strings"
)

func writeCanonicalJSONValue(b *strings.Builder, v any) {
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if x {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case string:
		b.WriteString(strconv.Quote(x))
	case float64:
		b.WriteString(strconv.FormatFloat(x, 'f', -1, 64))
	case []any:
		b.WriteByte('[')
		for i, item := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			writeCanonicalJSONValue(b, item)
		}
		b.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		// Small keysets here; std sort keeps output deterministic.
		sortStrings(keys)
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(strconv.Quote(k))
			b.WriteByte(':')
			writeCanonicalJSONValue(b, x[k])
		}
		b.WriteByte('}')
	default:
		// Any unsupported JSON type resolves to null for stable hashing.
		b.WriteString("null")
	}
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		j := i
		for j > 0 && values[j-1] > values[j] {
			values[j-1], values[j] = values[j], values[j-1]
			j--
		}
	}
}

// BuildJSONPayloadAndWeakETag marshals data and computes a weak ETag from a canonical JSON view.
func BuildJSONPayloadAndWeakETag(data any) ([]byte, string, error) {
	payload, err := json.Marshal(data)
	if err != nil {
		return nil, "", err
	}
	var generic any
	if err := json.Unmarshal(payload, &generic); err != nil {
		return nil, "", err
	}
	var canonical strings.Builder
	writeCanonicalJSONValue(&canonical, generic)
	sum := sha256.Sum256([]byte(canonical.String()))
	etag := `W/"` + hex.EncodeToString(sum[:]) + `"`
	return payload, etag, nil
}

// IfNoneMatchSatisfied returns true when If-None-Match matches "*" or the provided etag.
func IfNoneMatchSatisfied(ifNoneMatchHeader, etag string) bool {
	if ifNoneMatchHeader == "" {
		return false
	}
	for candidate := range strings.SplitSeq(ifNoneMatchHeader, ",") {
		tag := strings.TrimSpace(candidate)
		if tag == "*" || tag == etag {
			return true
		}
	}
	return false
}
