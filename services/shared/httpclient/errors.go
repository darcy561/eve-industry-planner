package httpclient

import (
	"fmt"
	"net/http"
)

// StatusError reports a response the caller asked to treat as a failure.
// It is produced by Response.Err and Stream.Err, never returned from Do or
// Stream directly, so a caller that reads meaning from 404 or 429 keeps it.
type StatusError struct {
	Status  int
	Header  http.Header
	Snippet string
}

func (e *StatusError) Error() string {
	if e.Snippet == "" {
		return fmt.Sprintf("http %d %s", e.Status, http.StatusText(e.Status))
	}
	return fmt.Sprintf("http %d %s: %s", e.Status, http.StatusText(e.Status), e.Snippet)
}

// BodyTooLargeError reports that a buffered body exceeded the configured cap.
// Stream is the way to read a body that is legitimately larger.
type BodyTooLargeError struct {
	Limit int64
}

func (e *BodyTooLargeError) Error() string {
	return fmt.Sprintf("response body exceeds %d bytes", e.Limit)
}
