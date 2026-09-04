package httpclient

import "time"

// Attempt is one completed try, reported to Config.OnComplete. It carries what
// a metric or a log line needs without the client choosing either.
type Attempt struct {
	Method   string
	URL      string
	Attempt  int
	Status   int
	Proto    string
	Wire     int64
	Duration time.Duration
	Err      error
}
