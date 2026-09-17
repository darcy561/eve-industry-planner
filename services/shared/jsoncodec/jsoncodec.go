// Package jsoncodec holds this codebase's JSON encoding policy. Reads are
// strict: a duplicate name, invalid UTF-8 and a case-only field match are errors
// rather than a plausible-looking result.
package jsoncodec

import (
	"bytes"
	"errors"
	"io"

	"encoding/json/jsontext"
	jsonv2 "encoding/json/v2"
)

// options is the house policy, and the only place it is written down.
// Deterministic is load-bearing: an ETag over these bytes churns without it.
// FormatNilSliceAsNull is not the shape an empty array should have on a wire —
// endpoints owing the SPA an array build one.
var options = jsonv2.JoinOptions(
	jsonv2.FormatNilSliceAsNull(true),
	jsonv2.FormatNilMapAsNull(true),
	jsontext.EscapeForHTML(true),
	jsonv2.Deterministic(true),
)

func Marshal(v any) ([]byte, error) { return jsonv2.Marshal(v, options) }

func Unmarshal(data []byte, v any) error { return jsonv2.Unmarshal(data, v, options) }

// Encode writes v to w followed by a newline, which is part of the wire shape:
// every HTTP response written through here carries one.
func Encode(w io.Writer, v any) error {
	if err := jsonv2.MarshalWrite(w, v, options); err != nil {
		return err
	}
	_, err := io.WriteString(w, "\n")
	return err
}

// Decode reads one value from r. Lenient by design: this is the path for a
// third-party response, where an unrecognised field means the other side added
// one, not that the body is wrong.
func Decode(r io.Reader, v any) error { return jsonv2.UnmarshalRead(r, v, options) }

// ErrTrailingData reports a body carrying more than the one value asked for.
// The underlying refusal is a syntax error, which reads as the wrong problem.
var ErrTrailingData = errors.New("unexpected data after the JSON value")

// UnmarshalRequest decodes one value from data into v, for a body another party
// sent: an undeclared member errors, trailing data is [ErrTrailingData].
func UnmarshalRequest(data []byte, v any) error {
	dec := jsontext.NewDecoder(bytes.NewReader(data))
	if err := jsonv2.UnmarshalDecode(dec, v, options, jsonv2.RejectUnknownMembers(true)); err != nil {
		return err
	}
	if _, err := dec.ReadToken(); !errors.Is(err, io.EOF) {
		return ErrTrailingData
	}
	return nil
}
