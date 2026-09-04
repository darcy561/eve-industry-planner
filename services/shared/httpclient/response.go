package httpclient

import (
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// Validators are the conditional-request tokens a response offers for its next fetch.
type Validators struct {
	ETag         string
	LastModified time.Time
}

// CacheInfo is how long the origin says the response stays good for.
// MaxAge is taken from Cache-Control, or derived from Expires when absent.
type CacheInfo struct {
	MaxAge  time.Duration
	Expires time.Time
}

// Response is a fully read response. Body is decompressed; Wire counts the bytes
// that crossed the connection, which is what transfer accounting wants.
type Response struct {
	Status      int
	Header      http.Header
	Body        []byte
	Wire        int64
	Duration    time.Duration
	NotModified bool
	Validators  Validators
	Cache       CacheInfo
}

// Stream is a response whose body the caller reads and closes. Body is decompressed.
type Stream struct {
	Status      int
	Header      http.Header
	Body        io.ReadCloser
	Duration    time.Duration
	NotModified bool
	Validators  Validators
	Cache       CacheInfo

	wire *atomic.Int64
}

// Wire returns the compressed bytes read from the connection so far, and the
// final count once Body is closed.
func (s *Stream) Wire() int64 {
	if s.wire == nil {
		return 0
	}
	return s.wire.Load()
}

// Err returns a *StatusError when the status is outside 2xx and not 304, and nil
// otherwise. Status is not an error by default: a caller that treats 304, 404 or
// 429 as data calls this only when it wants the simple path.
func (r *Response) Err() error {
	if r.Status >= 200 && r.Status < 300 || r.Status == http.StatusNotModified {
		return nil
	}
	return &StatusError{Status: r.Status, Header: r.Header, Snippet: snippet(r.Body)}
}

func snippet(body []byte) string {
	const limit = 512
	if len(body) > limit {
		return string(body[:limit])
	}
	return string(body)
}

func readValidators(h http.Header) Validators {
	v := Validators{ETag: h.Get("ETag")}
	if lm := h.Get("Last-Modified"); lm != "" {
		if t, err := http.ParseTime(lm); err == nil {
			v.LastModified = t
		}
	}
	return v
}

func readCacheInfo(h http.Header, now time.Time) CacheInfo {
	var info CacheInfo

	for directive := range strings.SplitSeq(h.Get("Cache-Control"), ",") {
		value, ok := strings.CutPrefix(strings.TrimSpace(directive), "max-age=")
		if !ok {
			continue
		}
		secs, err := strconv.Atoi(value)
		if err != nil || secs < 0 {
			continue
		}
		info.MaxAge = time.Duration(secs) * time.Second
		break
	}

	if expires := h.Get("Expires"); expires != "" {
		if t, err := http.ParseTime(expires); err == nil {
			info.Expires = t
			if info.MaxAge == 0 {
				if d := t.Sub(now); d > 0 {
					info.MaxAge = d
				}
			}
		}
	}

	return info
}

// countingReader tallies bytes as they leave the connection, before decompression.
type countingReader struct {
	r io.Reader
	n *atomic.Int64
}

func (c countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n.Add(int64(n))
	return n, err
}

// multiCloser closes a decompressing reader and the response body under it.
type multiCloser struct {
	io.Reader
	closers []io.Closer
}

func (m multiCloser) Close() error {
	var firstErr error
	for _, c := range m.closers {
		if err := c.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
