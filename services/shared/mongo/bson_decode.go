package mongo

import (
	"bytes"
	"maps"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// UnmarshalDocumentM decodes a BSON document into bson.M with nested documents as bson.M
// (same DefaultDocumentM behaviour as the shared Mongo client).
func UnmarshalDocumentM(data []byte) (bson.M, error) {
	dec := bson.NewDecoder(bson.NewDocumentReader(bytes.NewReader(data)))
	dec.DefaultDocumentM()
	var out bson.M
	if err := dec.Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

// AsDocumentM converts a BSON-decoded subdocument (bson.M, bson.D, or map[string]any) to bson.M.
func AsDocumentM(v any) bson.M {
	switch m := v.(type) {
	case nil:
		return nil
	case bson.M:
		return m
	case map[string]any:
		out := make(bson.M, len(m))
		maps.Copy(out, m)
		return out
	case bson.D:
		out := make(bson.M, len(m))
		for _, e := range m {
			out[e.Key] = e.Value
		}
		return out
	default:
		raw, err := bson.Marshal(v)
		if err != nil {
			return nil
		}
		out, err := UnmarshalDocumentM(raw)
		if err != nil {
			return nil
		}
		return out
	}
}
