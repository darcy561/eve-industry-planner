package httpclient

import (
	"encoding/json"
	"fmt"
	"io"
)

// JSON decodes the body into v. A status outside 2xx is returned as a
// *StatusError instead, so a caller need not check twice.
func (r *Response) JSON(v any) error {
	if err := r.Err(); err != nil {
		return err
	}
	if err := json.Unmarshal(r.Body, v); err != nil {
		return fmt.Errorf("decode json: %w", err)
	}
	return nil
}

// StreamJSON decodes a JSON array from r one element at a time, passing each to
// fn, so a large body never has to be held whole. An error from fn stops the
// walk and is returned as-is.
func StreamJSON[T any](r io.Reader, fn func(T) error) error {
	dec := json.NewDecoder(r)

	opening, err := dec.Token()
	if err != nil {
		return fmt.Errorf("read opening token: %w", err)
	}
	if delim, ok := opening.(json.Delim); !ok || delim != '[' {
		return fmt.Errorf("expected a json array, got %v", opening)
	}

	for dec.More() {
		var item T
		if err := dec.Decode(&item); err != nil {
			return fmt.Errorf("decode array element: %w", err)
		}
		if err := fn(item); err != nil {
			return err
		}
	}

	if _, err := dec.Token(); err != nil {
		return fmt.Errorf("read closing token: %w", err)
	}
	return nil
}
