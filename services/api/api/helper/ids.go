package helper

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
)

const (
	validIDRegex = `^\d+$`
)

var (
	// ErrMethodNotAllowed is returned when the HTTP method is not GET or POST
	ErrMethodNotAllowed = errors.New("method not allowed")
)

var validIDPattern = regexp.MustCompile(validIDRegex)

// ExtractRequestBody extracts and decodes a request body struct from HTTP requests.
// It is a generic function that accepts any struct type T and returns a populated instance.
//
// Example usage:
//
//	type SystemIndexesBody struct {
//		RequestedIDs []string `json:"system_ids"`
//	}
//	body, err := helper.ExtractRequestBody[SystemIndexesBody](r)
func ExtractRequestBody[T any](r *http.Request) (T, error) {
	var zero T

	var result T
	if err := DecodeJSONRequest(r, &result, DefaultMaxBodySize); err != nil {
		return zero, fmt.Errorf("invalid JSON body: %w", err)
	}
	return result, nil
}

// ExtractIDsFromRequest extracts IDs from POST body.
// POST: expects array of IDs in JSON body ["12345", "67890"]
// Returns ErrMethodNotAllowed if method is not POST
// Deprecated: Use ExtractRequestBody with a struct type instead for better type safety.
func ExtractIDsFromRequest(r *http.Request) ([]string, error) {
	if r.Method != http.MethodPost {
		return nil, ErrMethodNotAllowed
	}
	return ExtractIDsFromPost(r)
}

// ExtractIDsFromPost extracts IDs from POST JSON body.
func ExtractIDsFromPost(r *http.Request) ([]string, error) {
	var ids []string
	if err := DecodeJSONRequest(r, &ids, DefaultMaxBodySize); err != nil {
		return nil, fmt.Errorf("invalid JSON body: %w", err)
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("empty array in request body")
	}
	return ids, nil
}

// ValidateIDs validates and filters IDs, returning valid IDs and count of invalid ones.
// Validates that IDs are numeric and can be parsed as int32.
func ValidateIDs(ids []string) ([]string, int) {
	validated := make([]string, 0, len(ids))
	invalidCount := 0

	for _, idStr := range ids {
		// Check format: must be numeric only
		if !validIDPattern.MatchString(idStr) {
			invalidCount++
			continue
		}

		// Check if it can be parsed as int32
		if _, err := strconv.ParseInt(idStr, 10, 32); err != nil {
			invalidCount++
			continue
		}

		validated = append(validated, idStr)
	}

	return validated, invalidCount
}
