package request

import (
	"net/http"

	"eve-industry-planner/shared/jsoncodec"
)

// CodedError is the body a planner auth refusal answers with.
type CodedError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// WriteCodedError answers with the refusal envelope.
//
// One writer rather than one per surface. The code is the part a client acts on,
// and the REST middleware, the session endpoints and the websocket upgrade each
// formatting their own body is how the upgrade came to answer in plain text
// while everything else answered JSON.
func WriteCodedError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = jsoncodec.Encode(w, CodedError{Code: code, Message: message})
}
