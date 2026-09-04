package models

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// ParseExtrasDeletedAtJSON interprets a JSON deletedAt value: null, number (epoch ms from legacy clients), or ISO/RFC3339 string.
func ParseExtrasDeletedAtJSON(raw json.RawMessage) *string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	if bytes.HasPrefix(raw, []byte(`"`)) {
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return nil
		}
		return coerceDeletedAtFromString(s)
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil && f != 0 {
		out := time.UnixMilli(int64(f)).UTC().Format(time.RFC3339Nano)
		return &out
	}
	return nil
}

func coerceDeletedAtFromString(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			out := t.UTC().Format(time.RFC3339Nano)
			return &out
		}
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil && n != 0 {
		out := time.UnixMilli(n).UTC().Format(time.RFC3339Nano)
		return &out
	}
	return nil
}

func coerceDeletedAtFromInterface(v any) *string {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case string:
		return coerceDeletedAtFromString(t)
	case int32:
		if t == 0 {
			return nil
		}
		out := time.UnixMilli(int64(t)).UTC().Format(time.RFC3339Nano)
		return &out
	case int64:
		if t == 0 {
			return nil
		}
		out := time.UnixMilli(t).UTC().Format(time.RFC3339Nano)
		return &out
	case float64:
		if t == 0 {
			return nil
		}
		out := time.UnixMilli(int64(t)).UTC().Format(time.RFC3339Nano)
		return &out
	case bson.DateTime:
		if t == 0 {
			return nil
		}
		out := time.UnixMilli(int64(t)).UTC().Format(time.RFC3339Nano)
		return &out
	case time.Time:
		if t.IsZero() {
			return nil
		}
		out := t.UTC().Format(time.RFC3339Nano)
		return &out
	default:
		return nil
	}
}

// UnmarshalBSON decodes legacy extras category rows (deletedAt as int64 ms, Date, or string).
func (e *ExtraCategory) UnmarshalBSON(data []byte) error {
	var doc struct {
		ID        string `bson:"id"`
		Label     string `bson:"label"`
		Deleted   bool   `bson:"deleted"`
		DeletedAt any    `bson:"deletedAt"`
	}
	if err := bson.Unmarshal(data, &doc); err != nil {
		return err
	}
	e.ID = doc.ID
	e.Label = doc.Label
	e.Deleted = doc.Deleted
	e.DeletedAt = coerceDeletedAtFromInterface(doc.DeletedAt)
	return nil
}

// UnmarshalJSON accepts string, number (epoch ms), or null for deletedAt.
func (e *ExtraCategory) UnmarshalJSON(data []byte) error {
	var w struct {
		ID        string          `json:"id"`
		Label     string          `json:"label"`
		Deleted   bool            `json:"deleted"`
		DeletedAt json.RawMessage `json:"deletedAt"`
	}
	if err := json.Unmarshal(data, &w); err != nil {
		return err
	}
	e.ID = w.ID
	e.Label = w.Label
	e.Deleted = w.Deleted
	e.DeletedAt = ParseExtrasDeletedAtJSON(w.DeletedAt)
	return nil
}
