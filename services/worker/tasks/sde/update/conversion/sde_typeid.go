package conversion

import (
	"encoding/json"
	"fmt"
	"strconv"
)

// parseSDETypeID reads type IDs from SDE JSONL rows (json.Unmarshal uses float64; some paths may use int or json.Number).
func parseSDETypeID(v any) (int, bool) {
	switch t := v.(type) {
	case float64:
		return int(t), true
	case float32:
		return int(t), true
	case int:
		return t, true
	case int32:
		return int(t), true
	case int64:
		return int(t), true
	case json.Number:
		i, err := t.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	case string:
		i, err := strconv.Atoi(t)
		if err != nil {
			return 0, false
		}
		return i, true
	default:
		return 0, false
	}
}

func formatSDETypeIDKey(v any) string {
	id, ok := parseSDETypeID(v)
	if !ok || id <= 0 {
		return ""
	}
	return fmt.Sprintf("%d", id)
}
