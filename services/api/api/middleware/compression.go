package middleware

import (
	"compress/gzip"
	"eve-industry-planner/shared/shared/logs"
	"net/http"
	"strconv"
	"strings"

	"github.com/andybalholm/brotli"
)

func CompressionConstructor() MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			acceptedEncodings := r.Header.Get("Accept-Encoding")

			if acceptedEncodings == "" {
				next.ServeHTTP(w, r)
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

			// Apply compression based on best encoding found
			switch bestEncoding {
			case "br":
				w.Header().Set("Vary", "Accept-Encoding")
				w.Header().Set("Content-Encoding", "br")
				w.Header().Del("Content-Length")
				br := brotli.NewWriterLevel(w, 5)
				defer br.Close()
				logs.DebugCtx(r.Context(), "brotli compression applied", "request", r.URL.Path)
				next.ServeHTTP(&brotliResponseWriter{ResponseWriter: w, Writer: br}, r)
			case "gzip":
				w.Header().Set("Vary", "Accept-Encoding")
				w.Header().Set("Content-Encoding", "gzip")
				w.Header().Del("Content-Length")
				logs.DebugCtx(r.Context(), "gzip compression applied", "request", r.URL.Path)
				gz, err := gzip.NewWriterLevel(w, gzip.BestSpeed)
				if err != nil {
					logs.ErrorCtx(r.Context(), "failed to create gzip writer", "error", err)
					next.ServeHTTP(w, r)
					return
				}
				defer gz.Close()
				next.ServeHTTP(&gzipResponseWriter{ResponseWriter: w, Writer: gz}, r)
			default:
				// No supported encoding found
				logs.DebugCtx(r.Context(), "no compression applied", "request", r.URL.Path)
				next.ServeHTTP(w, r)
			}
		})
	}
}

// gzipResponseWriter wraps http.ResponseWriter to write compressed content
type gzipResponseWriter struct {
	http.ResponseWriter
	Writer *gzip.Writer
}

func (g *gzipResponseWriter) Write(b []byte) (int, error) {
	return g.Writer.Write(b)
}

// brotliResponseWriter wraps http.ResponseWriter to write compressed content
type brotliResponseWriter struct {
	http.ResponseWriter
	Writer *brotli.Writer
}

func (b *brotliResponseWriter) Write(data []byte) (int, error) {
	return b.Writer.Write(data)
}
