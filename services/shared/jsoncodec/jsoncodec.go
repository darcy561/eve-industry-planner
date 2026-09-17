// Package jsoncodec is how this codebase reads and writes JSON on a wire.
//
// It exists so the encoding policy is written once. Every call site used to
// reach for encoding/json directly, which meant the answer to "what shape does
// this emit" was whatever the stdlib defaulted to that day, in 160 files.
//
// What it buys over the v1 package is read-side strictness: a duplicate object
// name is an error rather than last-wins, invalid UTF-8 is an error rather than
// U+FFFD, and a field matches by name rather than by name-ignoring-case. Speed
// is not the reason — the gain is small on reads and negative on writes.
package jsoncodec

import (
	"io"

	"encoding/json/jsontext"
	jsonv2 "encoding/json/v2"
)

// options is the house policy, and the only place it is written down.
//
// The three Format/Escape options hold output byte-identical to what the v1
// package produced, so a call site can move here without changing what any
// reader sees. Deterministic fixes map ordering, which v2 otherwise leaves
// unspecified and which an ETag over the bytes would otherwise churn on.
//
// FormatNilSliceAsNull is transitional. A nil slice is emitted as null because
// that is what v1 did, not because it is right: an empty array belongs on the
// wire as []. It comes off per boundary once each one has been looked at.
var options = jsonv2.JoinOptions(
	jsonv2.FormatNilSliceAsNull(true),
	jsonv2.FormatNilMapAsNull(true),
	jsontext.EscapeForHTML(true),
	jsonv2.Deterministic(true),
)

// Marshal encodes v under the house options.
func Marshal(v any) ([]byte, error) { return jsonv2.Marshal(v, options) }

// Unmarshal decodes data into v under the house options.
func Unmarshal(data []byte, v any) error { return jsonv2.Unmarshal(data, v, options) }

// Encode writes v to w, in place of json.NewEncoder(w).Encode(v).
//
// The trailing newline is the one v1's Encoder wrote and MarshalWrite does not.
// It is here so a call site can move without changing a byte of what it sends:
// every HTTP response this replaces ends with one today.
func Encode(w io.Writer, v any) error {
	if err := jsonv2.MarshalWrite(w, v, options); err != nil {
		return err
	}
	_, err := io.WriteString(w, "\n")
	return err
}

// Decode reads one value from r into v, in place of json.NewDecoder(r).Decode(v).
func Decode(r io.Reader, v any) error { return jsonv2.UnmarshalRead(r, v, options) }
