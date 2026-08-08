package helper

import (
	"encoding/json"
	"net/http"
)

// EncodeJSON encodes data as JSON and writes it to the response.
// Compression is handled by nginx, so this function just does JSON encoding.
// Returns an error if encoding fails
func EncodeJSON(w http.ResponseWriter, data any) error {
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(data)
}
