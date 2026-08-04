package mongo

// RetryOption customizes retry logging for Docs helpers that wrap [Retry].
type RetryOption func(*retryOptions)

type retryOptions struct {
	operationName string
}

// WithOpName overrides the default log label for a retried Docs helper.
func WithOpName(name string) RetryOption {
	return func(o *retryOptions) {
		if name != "" {
			o.operationName = name
		}
	}
}

func applyRetryOptions(defaultName string, opts []RetryOption) string {
	o := retryOptions{operationName: defaultName}
	for _, opt := range opts {
		if opt != nil {
			opt(&o)
		}
	}
	if o.operationName == "" {
		return defaultName
	}
	return o.operationName
}
