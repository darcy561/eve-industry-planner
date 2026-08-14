package middleware

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/andybalholm/brotli"

	"eve-industry-planner/api/helper"
	sharedcompression "eve-industry-planner/shared/compression"
	"eve-industry-planner/shared/logs"

	"go.uber.org/zap"
)

const (
	responseCompressionMinBytes = 5 * 1024
)

func attachCompressionCompleted(r *http.Request, negotiated, applied, skipReason string, bodyBytes, compressedBytes int) {
	if r == nil {
		return
	}
	extra := map[string]any{
		"negotiated": negotiated,
		"applied":    applied,
	}
	if bodyBytes > 0 {
		extra["body_bytes"] = bodyBytes
	}
	if compressedBytes > 0 {
		extra["compressed_bytes"] = compressedBytes
	}
	if skipReason != "" {
		extra["skip_reason"] = skipReason
	}
	logs.AttachDebugStep(r, "compression_completed", extra)
}

func attachRequestBodyDecoded(r *http.Request, encoding string) {
	if r == nil || encoding == "" {
		return
	}
	logs.AttachDebugStep(r, "request_body_decoded", map[string]any{
		"encoding": encoding,
	})
}

// withContentEncodingOnLogger adds content_encoding to the request-scoped logger (LoggerKey) so
// handlers and logs.InfoCtx see the negotiated encoding after this middleware runs.
func withContentEncodingOnLogger(r *http.Request, encoding string) *http.Request {
	ctx := r.Context()
	if l, ok := ctx.Value(logs.LoggerKey{}).(*zap.Logger); ok && l != nil {
		ctx = context.WithValue(ctx, logs.LoggerKey{}, l.With(zap.String("content_encoding", encoding)))
	}
	return r.WithContext(ctx)
}

// CompressionConstructor negotiates Accept-Encoding and wraps the response writer when brotli or gzip applies.
// It attaches content_encoding on the scoped logger before the mux; r.Context() is already enriched by
// RequestTimeoutConstructor and RequestLoggingConstructor upstream.
func CompressionConstructor() MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			decodedRequest, err := decodeRequestBody(r)
			if err != nil {
				helper.RespondEndpointError(w, r, http.StatusUnsupportedMediaType, "Unsupported or invalid request encoding", "failed to decode compressed request body", "request_body_decode_failed", "", err, nil)
				return
			}
			r = decodedRequest

			// Add Cache-Control header for POST requests to help Cloudflare skip caching attempts
			// Use "private, no-store" to clearly signal user-specific data that should not be edge cached
			if r.Method == http.MethodPost {
				w.Header().Set("Cache-Control", "private, no-store")
			}

			acceptedEncodings := r.Header.Get("Accept-Encoding")

			if acceptedEncodings == "" {
				r = withContentEncodingOnLogger(r, "identity")
				next.ServeHTTP(w, r)
				attachCompressionCompleted(r, "identity", "identity", "no_accept_encoding", 0, 0)
				return
			}

			// Parse encodings with quality values and select the best supported one
			var bestEncoding string
			var bestQuality float64 = -1.0
			headerLen := len(acceptedEncodings)

			for i := 0; i < headerLen; {
				// Skip whitespace and commas
				for i < headerLen && (acceptedEncodings[i] == ' ' || acceptedEncodings[i] == '\t' || acceptedEncodings[i] == ',') {
					i++
				}
				if i >= headerLen {
					break
				}

				start := i
				// Find end of encoding name (comma or semicolon)
				for i < headerLen && acceptedEncodings[i] != ',' && acceptedEncodings[i] != ';' {
					i++
				}

				encoding := strings.TrimSpace(acceptedEncodings[start:i])
				encLen := len(encoding)

				// Skip empty encodings
				if encLen == 0 {
					// Skip to next encoding
					for i < headerLen && acceptedEncodings[i] != ',' {
						i++
					}
					continue
				}

				// Parse quality value (defaults to 1.0 if not specified)
				quality := 1.0
				if i < headerLen && acceptedEncodings[i] == ';' {
					i++ // skip semicolon
					// Skip whitespace after semicolon
					for i < headerLen && (acceptedEncodings[i] == ' ' || acceptedEncodings[i] == '\t') {
						i++
					}
					// Check for q=
					if i+1 < headerLen && (acceptedEncodings[i] == 'q' || acceptedEncodings[i] == 'Q') && acceptedEncodings[i+1] == '=' {
						i += 2 // skip "q="
						// Skip whitespace after =
						for i < headerLen && (acceptedEncodings[i] == ' ' || acceptedEncodings[i] == '\t') {
							i++
						}
						// Parse the quality value
						qStart := i
						for i < headerLen && acceptedEncodings[i] != ',' && acceptedEncodings[i] != ' ' && acceptedEncodings[i] != '\t' {
							i++
						}
						if qStart < i {
							if q, err := strconv.ParseFloat(acceptedEncodings[qStart:i], 64); err == nil {
								quality = q
							}
						}
					}
				}

				// Skip encodings with quality 0 (explicitly not accepted)
				if quality == 0 {
					// Skip to next encoding
					for i < headerLen && acceptedEncodings[i] != ',' {
						i++
					}
					continue
				}

				// Handle wildcard (*) - use brotli if quality is better than current best
				if encoding == "*" && quality > bestQuality {
					bestEncoding = "br"
					bestQuality = quality
				}

				// Check if this encoding is supported and has higher or equal quality
				// Prefer brotli when quality is equal (better compression ratio)
				if encLen >= 2 && quality >= bestQuality {
					// Fast check for "br" or "brotli"
					if (encoding[0] == 'b' || encoding[0] == 'B') && (encoding[1] == 'r' || encoding[1] == 'R') {
						if encLen == 2 || (encLen == 6 && strings.EqualFold(encoding, "brotli")) {
							// Prefer brotli if quality is better, or equal and current best is gzip
							if quality > bestQuality || (quality == bestQuality && bestEncoding == "gzip") {
								bestEncoding = "br"
								bestQuality = quality
							}
						}
					} else if encLen == 4 && (encoding[0] == 'g' || encoding[0] == 'G') &&
						(encoding[1] == 'z' || encoding[1] == 'Z') &&
						(encoding[2] == 'i' || encoding[2] == 'I') &&
						(encoding[3] == 'p' || encoding[3] == 'P') {
						// Only set gzip if quality is strictly better (brotli preferred when equal)
						if quality > bestQuality {
							bestEncoding = "gzip"
							bestQuality = quality
						}
					}
				}

				// Skip to next encoding
				for i < headerLen && acceptedEncodings[i] != ',' {
					i++
				}
			}

			switch bestEncoding {
			case "br":
				r = withContentEncodingOnLogger(r, "br")
				buffered := newBufferedResponseWriter()
				next.ServeHTTP(buffered, r)
				writeBufferedResponse(r, w, buffered, "br")
			case "gzip":
				r = withContentEncodingOnLogger(r, "gzip")
				buffered := newBufferedResponseWriter()
				next.ServeHTTP(buffered, r)
				writeBufferedResponse(r, w, buffered, "gzip")
			default:
				r = withContentEncodingOnLogger(r, "identity")
				next.ServeHTTP(w, r)
				attachCompressionCompleted(r, "identity", "identity", "unsupported_or_no_match", 0, 0)
			}
		})
	}
}

type bufferedResponseWriter struct {
	headers     http.Header
	statusCode  int
	wroteHeader bool
	body        bytes.Buffer
}

func newBufferedResponseWriter() *bufferedResponseWriter {
	return &bufferedResponseWriter{
		headers: make(http.Header),
	}
}

func (b *bufferedResponseWriter) Header() http.Header {
	return b.headers
}

func (b *bufferedResponseWriter) WriteHeader(statusCode int) {
	if b.wroteHeader {
		return
	}
	b.wroteHeader = true
	b.statusCode = statusCode
}

func (b *bufferedResponseWriter) Write(data []byte) (int, error) {
	if !b.wroteHeader {
		b.WriteHeader(http.StatusOK)
	}
	return b.body.Write(data)
}

func (b *bufferedResponseWriter) resolvedStatusCode() int {
	if b.statusCode == 0 {
		return http.StatusOK
	}
	return b.statusCode
}

func selectResponseCompressionLevel(bodySize int) int {
	if bodySize > sharedcompression.ResponseHighLevelBytes {
		return sharedcompression.ResponseHighLevel
	}
	return sharedcompression.ResponseDefaultLevel
}

func copyHeaders(dst, src http.Header) {
	for k, values := range src {
		dst.Del(k)
		for _, v := range values {
			dst.Add(k, v)
		}
	}
}

func writeIdentityResponse(r *http.Request, w http.ResponseWriter, buffered *bufferedResponseWriter, negotiated, skipReason string) {
	bodyBytes := buffered.body.Len()
	attachCompressionCompleted(r, negotiated, "identity", skipReason, bodyBytes, 0)

	dstHeaders := w.Header()
	copyHeaders(dstHeaders, buffered.headers)
	dstHeaders.Del("Content-Encoding")
	dstHeaders.Set("Content-Length", strconv.Itoa(buffered.body.Len()))
	w.WriteHeader(buffered.resolvedStatusCode())
	if buffered.body.Len() > 0 {
		_, _ = w.Write(buffered.body.Bytes())
	}
}

func writeBufferedResponse(r *http.Request, w http.ResponseWriter, buffered *bufferedResponseWriter, encoding string) {
	statusCode := buffered.resolvedStatusCode()
	bodyBytes := buffered.body.Len()
	if bodyBytes < responseCompressionMinBytes {
		writeIdentityResponse(r, w, buffered, encoding, "below_min_size")
		return
	}
	if statusCode == http.StatusNoContent {
		writeIdentityResponse(r, w, buffered, encoding, "no_content")
		return
	}
	if statusCode == http.StatusNotModified {
		writeIdentityResponse(r, w, buffered, encoding, "not_modified")
		return
	}

	level := selectResponseCompressionLevel(bodyBytes)
	var compressed bytes.Buffer

	switch encoding {
	case "br":
		br := brotli.NewWriterLevel(&compressed, level)
		if _, err := br.Write(buffered.body.Bytes()); err != nil {
			_ = br.Close()
			logs.ErrorCtx(r.Context(), "failed to brotli-compress response", "error", err)
			writeIdentityResponse(r, w, buffered, encoding, "compress_failed")
			return
		}
		if err := br.Close(); err != nil {
			logs.ErrorCtx(r.Context(), "failed to close brotli writer", "error", err)
			writeIdentityResponse(r, w, buffered, encoding, "compress_failed")
			return
		}
	case "gzip":
		gz, err := gzip.NewWriterLevel(&compressed, level)
		if err != nil {
			logs.ErrorCtx(r.Context(), "failed to create gzip writer", "error", err)
			writeIdentityResponse(r, w, buffered, encoding, "compress_failed")
			return
		}
		if _, err := gz.Write(buffered.body.Bytes()); err != nil {
			_ = gz.Close()
			logs.ErrorCtx(r.Context(), "failed to gzip-compress response", "error", err)
			writeIdentityResponse(r, w, buffered, encoding, "compress_failed")
			return
		}
		if err := gz.Close(); err != nil {
			logs.ErrorCtx(r.Context(), "failed to close gzip writer", "error", err)
			writeIdentityResponse(r, w, buffered, encoding, "compress_failed")
			return
		}
	default:
		writeIdentityResponse(r, w, buffered, encoding, "unsupported_encoding")
		return
	}

	attachCompressionCompleted(r, encoding, encoding, "", bodyBytes, compressed.Len())

	dstHeaders := w.Header()
	copyHeaders(dstHeaders, buffered.headers)
	dstHeaders.Set("Vary", "Accept-Encoding")
	dstHeaders.Set("Content-Encoding", encoding)
	dstHeaders.Set("Content-Length", strconv.Itoa(compressed.Len()))
	w.WriteHeader(statusCode)
	_, _ = w.Write(compressed.Bytes())
}

type requestReadCloser struct {
	io.Reader
	closeFn func() error
}

func (r *requestReadCloser) Close() error {
	if r.closeFn == nil {
		return nil
	}
	return r.closeFn()
}

func decodeRequestBody(r *http.Request) (*http.Request, error) {
	rawEncoding := strings.TrimSpace(strings.ToLower(r.Header.Get("Content-Encoding")))
	if rawEncoding == "" || rawEncoding == "identity" {
		return r, nil
	}

	switch rawEncoding {
	case "br", "brotli":
		originalBody := r.Body
		r.Body = &requestReadCloser{
			Reader: brotli.NewReader(originalBody),
			closeFn: func() error {
				return originalBody.Close()
			},
		}
		attachRequestBodyDecoded(r, rawEncoding)
	case "gzip":
		originalBody := r.Body
		gz, err := gzip.NewReader(originalBody)
		if err != nil {
			_ = originalBody.Close()
			return nil, fmt.Errorf("invalid gzip request body: %w", err)
		}
		r.Body = &requestReadCloser{
			Reader: gz,
			closeFn: func() error {
				gzErr := gz.Close()
				bodyErr := originalBody.Close()
				if gzErr != nil {
					return gzErr
				}
				return bodyErr
			},
		}
		attachRequestBodyDecoded(r, rawEncoding)
	default:
		return nil, fmt.Errorf("unsupported content encoding: %s", rawEncoding)
	}

	r.Header.Del("Content-Encoding")
	r.Header.Del("Content-Length")
	r.ContentLength = -1
	return r, nil
}
