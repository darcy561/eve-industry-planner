package helper

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	// DefaultMaxBodySize is the default maximum request body size (1MB)
	DefaultMaxBodySize = 1024 * 1024
)

// DecodeJSONRequest decodes a JSON request body into the provided target struct.
// It includes security measures: body size limits, disallowing unknown fields, and checking for extra data.
// Returns an error if decoding fails, body is too large, or contains extra data.
//
// Usage:
//
//	var userDoc models.UserAccountDocument
//	if err := helper.DecodeJSONRequest(r, &userDoc, helper.DefaultMaxBodySize); err != nil {
//	    http.Error(w, err.Error(), http.StatusBadRequest)
//	    return
//	}
func DecodeJSONRequest(r *http.Request, target interface{}, maxBodySize int64) error {
	if maxBodySize <= 0 {
		maxBodySize = DefaultMaxBodySize
	}

	// Limit request body size to prevent DoS attacks
	r.Body = http.MaxBytesReader(nil, r.Body, maxBodySize)

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields() // Reject requests with unexpected fields

	if err := decoder.Decode(target); err != nil {
		if err == io.EOF {
			return errors.New("request body is required")
		}
		if strings.Contains(err.Error(), "request body too large") {
			return errors.New("request body too large")
		}
		return fmt.Errorf("invalid request body: %w", err)
	}

	// Ensure body was fully consumed (prevents extra data attacks)
	if _, err := decoder.Token(); err != io.EOF {
		return errors.New("request body contains extra data")
	}

	return nil
}
