package helper

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"encoding/json/jsontext"
	jsonv2 "encoding/json/v2"

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

	if err := jsoncodec.UnmarshalRequest(rawBody, target); err != nil {
		if errors.Is(err, jsoncodec.ErrTrailingData) {
			return &JSONRequestError{
				PublicMessage: "request body contains extra data",
				Detail:        "extra_data",
				BodyPreview:   makeJSONPreview(rawBody),
				Cause:         err,
			}
		}
		return buildJSONRequestError(err, rawBody)
	}

	return nil
}

// buildJSONRequestError fills the shape the 400 body is written from. The field
// path comes from the error's JSON pointer, not from parsing its message.
func buildJSONRequestError(err error, rawBody []byte) error {
	preview := makeJSONPreview(rawBody)

	if semantic, ok := errors.AsType[*jsonv2.SemanticError](err); ok {
		if errors.Is(err, jsonv2.ErrUnknownName) {
			return &JSONRequestError{
				PublicMessage: "invalid request body",
				Detail:        "unknown_field",
				Field:         fieldPath(semantic.JSONPointer),
				BodyPreview:   preview,
				Cause:         err,
			}
		}
		return &JSONRequestError{
			PublicMessage: "invalid request body",
			Detail:        fmt.Sprintf("type_mismatch (%s -> %s)", semantic.JSONKind, semantic.GoType),
			Field:         fieldPath(semantic.JSONPointer),
			Offset:        semantic.ByteOffset,
			BodyPreview:   preview,
			Cause:         err,
		}
	}

	if syntactic, ok := errors.AsType[*jsontext.SyntacticError](err); ok {
		return &JSONRequestError{
			PublicMessage: "invalid request body",
			Detail:        "syntax_error",
			Offset:        syntactic.ByteOffset,
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

// fieldPath renders a pointer as the dotted path the 400 body carries, an array
// index being one step: "list.0.count". Walked by token, not by trimming
// slashes, because a pointer escapes "/" and "~" in a name.
func fieldPath(p jsontext.Pointer) string {
	var parts []string
	for token := range p.Tokens() {
		parts = append(parts, token)
	}
	if len(parts) == 0 {
		return "(root)"
	}
	return strings.Join(parts, ".")
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

// EncodeJSON writes data as the response body, leaving the status to the caller:
// most have already chosen one, and net/http sends 200 for the rest.
func EncodeJSON(w http.ResponseWriter, data any) error {
	w.Header().Set("Content-Type", "application/json")
	return jsoncodec.Encode(w, data)
}

// EncodeJSONStatus writes data as the response body under an explicit status.
//
// The content type is set here rather than by delegating to EncodeJSON, because
// WriteHeader sends the header map as it stands and a Set after it is lost.
func EncodeJSONStatus(w http.ResponseWriter, status int, data any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return jsoncodec.Encode(w, data)
}
