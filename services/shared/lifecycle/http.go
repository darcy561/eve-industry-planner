package lifecycle

import (
	"context"
	"fmt"
	"net/http"
)

// HTTPServer starts srv in the background and returns a Runner that Shutdowns it.
func HTTPServer(name string, srv *http.Server) (Runner, error) {
	if srv == nil {
		return nil, fmt.Errorf("lifecycle: http server required")
	}
	if name == "" {
		name = "http"
	}
	go func() {
		err := srv.ListenAndServe()
		if err != nil && err != http.ErrServerClosed {
			// Process will typically be torn down via health / supervisor; log via stdlib
			// would require logs import — leave silent; callers rely on Shutdown.
			_ = err
		}
	}()
	return Func{
		RunnerName: name,
		Fn: func(ctx context.Context) {
			_ = srv.Shutdown(ctx)
		},
	}, nil
}
