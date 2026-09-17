package helper

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"eve-industry-planner/shared/jsoncodec"
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
func DecodeJSONRequest(r *http.Request, target any, maxBodySize int64) error {
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

	if after, ok := strings.CutPrefix(err.Error(), "json: unknown field "); ok {
		field := after
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

// EncodeJSON writes data as the response body. Compression is nginx's job, so
// this only encodes.
//
// It deliberately does not write a status: most callers have already chosen one,
// and net/http sends 200 for those that have not.
func EncodeJSON(w http.ResponseWriter, data any) error {
	w.Header().Set("Content-Type", "application/json")
	return jsoncodec.Encode(w, data)
}

// EncodeJSONStatus writes data as the response body under an explicit status.
//
// The status has to go first: once a byte of the body is written net/http has
// already sent 200, and a later WriteHeader is dropped with a warning.
func EncodeJSONStatus(w http.ResponseWriter, status int, data any) error {
	// Set the content type before the status, not by delegating to EncodeJSON:
	// WriteHeader sends the header map as it stands, and a Set after it is lost.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return jsoncodec.Encode(w, data)
}
