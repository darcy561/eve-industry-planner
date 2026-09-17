// Package jsoncodec holds this codebase's JSON encoding policy. Strictness runs
// both ways: on a read a duplicate name, invalid UTF-8 and a case-only field
// match are errors rather than a plausible-looking result, and on a write an
// invalid UTF-8 string stops the write rather than being repaired into U+FFFD.
package jsoncodec

import (
	"bytes"
	"errors"
	"fmt"
	"io"

	"encoding/json/jsontext"
	jsonv2 "encoding/json/v2"
)

// options is the house policy, and the only place it is written down.
//
// An empty collection is written empty — `[]` and `{}` — and `null` is left for
// what is genuinely absent. A reader calling Object.values on a null throws,
// and on an empty object does not. Deterministic is load-bearing: an ETag taken
// over these bytes churns without it.
var options = jsonv2.JoinOptions(
	jsontext.EscapeForHTML(true),
	jsonv2.Deterministic(true),
)

func Marshal(v any) ([]byte, error) { return jsonv2.Marshal(v, options) }

// MarshalIndent encodes v indented, for the SDE files a browser downloads. The
// indentation is roughly half their uncompressed size, so it is a payload
// decision rather than a formatting one and is not taken here.
func MarshalIndent(v any) ([]byte, error) {
	return jsonv2.Marshal(v, options, jsontext.WithIndent("  "))
}

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

// StreamArray reads a JSON array from r one element at a time, passing each to
// fn. An error from fn stops the walk and is returned as it is.
//
// It exists so a response too large to hold in memory can still be read: the
// ESI market-order and price feeds are megabytes, and decoding them whole costs
// the peak this avoids.
func StreamArray[T any](r io.Reader, fn func(T) error) error {
	dec := jsontext.NewDecoder(r)

	opening, err := dec.ReadToken()
	if err != nil {
		return fmt.Errorf("read opening token: %w", err)
	}
	if opening.Kind() != '[' {
		return fmt.Errorf("expected a json array, got %v", opening)
	}

	for dec.PeekKind() != ']' {
		var item T
		if err := jsonv2.UnmarshalDecode(dec, &item, options); err != nil {
			return fmt.Errorf("decode array element: %w", err)
		}
		if err := fn(item); err != nil {
			return err
		}
	}

	if _, err := dec.ReadToken(); err != nil {
		return fmt.Errorf("read closing token: %w", err)
	}
	return nil
}

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
