package helper

import (
	"bytes"
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
	maxJSONBodyPreview = 512
)

// JSONRequestError carries safe, structured diagnostics for malformed JSON requests.
type JSONRequestError struct {
	PublicMessage string
	Detail        string
	Field         string
	Offset        int64
	BodyPreview   string
	Cause         error
}

func (e *JSONRequestError) Error() string {
	if e == nil {
		return "invalid request body"
	}
	if e.PublicMessage != "" {
		return e.PublicMessage
	}
	return "invalid request body"
}

func (e *JSONRequestError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

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

	limited := io.LimitReader(r.Body, maxBodySize+1)
	rawBody, err := io.ReadAll(limited)
	if err != nil {
		return &JSONRequestError{
			PublicMessage: "failed to read request body",
			Detail:        "read_error",
			Cause:         err,
		}
	}
	if int64(len(rawBody)) > maxBodySize {
		return &JSONRequestError{
			PublicMessage: "request body too large",
			Detail:        "body_too_large",
			BodyPreview:   makeJSONPreview(rawBody[:maxBodySize]),
		}
	}
	if len(rawBody) == 0 {
		return &JSONRequestError{
			PublicMessage: "request body is required",
			Detail:        "empty_body",
		}
	}

	decoder := json.NewDecoder(bytes.NewReader(rawBody))
	decoder.DisallowUnknownFields() // Reject requests with unexpected fields

	if err := decoder.Decode(target); err != nil {
		if err == io.EOF {
			return &JSONRequestError{
				PublicMessage: "request body is required",
				Detail:        "empty_body",
			}
		}
		return buildJSONRequestError(err, rawBody)
	}

	// Ensure body was fully consumed (prevents extra data attacks)
	if _, err := decoder.Token(); err != io.EOF {
		return &JSONRequestError{
			PublicMessage: "request body contains extra data",
			Detail:        "extra_data",
			BodyPreview:   makeJSONPreview(rawBody),
			Cause:         err,
		}
	}

	return nil
}

func buildJSONRequestError(err error, rawBody []byte) error {
	preview := makeJSONPreview(rawBody)
	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) {
		return &JSONRequestError{
			PublicMessage: "invalid request body",
			Detail:        "syntax_error",
			Offset:        syntaxErr.Offset,
			BodyPreview:   preview,
			Cause:         err,
		}
	}

	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		field := strings.TrimSpace(typeErr.Field)
		if field == "" {
			field = "(root)"
		}
		return &JSONRequestError{
			PublicMessage: "invalid request body",
			Detail:        fmt.Sprintf("type_mismatch (%s -> %s)", typeErr.Value, typeErr.Type.String()),
			Field:         field,
			Offset:        typeErr.Offset,
			BodyPreview:   preview,
			Cause:         err,
		}
	}

	if strings.HasPrefix(err.Error(), "json: unknown field ") {
		field := strings.TrimPrefix(err.Error(), "json: unknown field ")
		field = strings.Trim(field, "\"")
		return &JSONRequestError{
			PublicMessage: "invalid request body",
			Detail:        "unknown_field",
			Field:         field,
			BodyPreview:   preview,
			Cause:         err,
		}
	}

	return &JSONRequestError{
		PublicMessage: "invalid request body",
		Detail:        "decode_error",
		BodyPreview:   preview,
		Cause:         err,
	}
}

func makeJSONPreview(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	trimmed := strings.TrimSpace(string(raw))
	trimmed = strings.ReplaceAll(trimmed, "\n", " ")
	trimmed = strings.ReplaceAll(trimmed, "\r", " ")
	trimmed = strings.ReplaceAll(trimmed, "\t", " ")
	if len(trimmed) <= maxJSONBodyPreview {
		return trimmed
	}
	return trimmed[:maxJSONBodyPreview] + "...(truncated)"
}
