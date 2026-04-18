package update

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"eve-industry-planner/shared/core/retry"
	"eve-industry-planner/shared/logs"
)

// retryableCCPHTTPError marks transient failures when talking to CCP static-data HTTP endpoints.
type retryableCCPHTTPError struct {
	err error
}

func (e retryableCCPHTTPError) Error() string {
	return e.err.Error()
}

func (e retryableCCPHTTPError) Unwrap() error {
	return e.err
}

// httpGetOKWithRetry performs a GET and returns the response only on HTTP 200.
// The caller must close resp.Body. Retries on transport errors, 5xx, and 429.
func httpGetOKWithRetry(ctx context.Context, url, operationName string) (*http.Response, error) {
	client := http.DefaultClient
	var resp *http.Response

	err := retry.Do(ctx, func(ctx context.Context) error {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}

		r, err := client.Do(req)
		if err != nil {
			return retryableCCPHTTPError{err: fmt.Errorf("http get: %w", err)}
		}

		if r.StatusCode >= 500 || r.StatusCode == http.StatusTooManyRequests {
			_ = r.Body.Close()
			return retryableCCPHTTPError{err: fmt.Errorf("http status %d", r.StatusCode)}
		}

		if r.StatusCode != http.StatusOK {
			_ = r.Body.Close()
			return fmt.Errorf("http status %d", r.StatusCode)
		}

		resp = r
		return nil
	}, func(err error, attempt retry.AttemptContext) bool {
		var re retryableCCPHTTPError
		if !errors.As(err, &re) {
			return false
		}
		logs.WarnCtx(ctx, "retrying CCP static-data HTTP request",
			"url", url,
			"operation", operationName,
			"attempt", attempt.Attempt,
			"max_attempts", attempt.MaxAttempts,
			"error", err)
		return true
	}, retry.WithOperationName(operationName))

	if err != nil {
		return nil, err
	}
	return resp, nil
}
