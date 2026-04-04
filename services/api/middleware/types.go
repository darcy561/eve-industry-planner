package middleware

import "net/http"

type MiddlewareConstructor func(http.Handler) http.Handler

// Chain composes multiple middleware constructors into one reusable wrapper.
func Chain(constructors ...MiddlewareConstructor) func(http.Handler) http.Handler {
	return func(h http.Handler) http.Handler {
		handler := h
		for i := len(constructors) - 1; i >= 0; i-- {
			handler = constructors[i](handler)
		}
		return handler
	}
}

// Wrap applies the provided middleware constructors to the given handler.
func Wrap(h http.Handler, constructors ...MiddlewareConstructor) http.Handler {
	return Chain(constructors...)(h)
}

// Group lets you register many routes with a shared middleware chain.
type Group struct {
	mux  *http.ServeMux
	wrap func(http.Handler) http.Handler
}

func NewGroup(mux *http.ServeMux, constructors ...MiddlewareConstructor) *Group {
	return &Group{
		mux:  mux,
		wrap: Chain(constructors...),
	}
}

func (g *Group) Handle(pattern string, h http.Handler) {
	g.mux.Handle(pattern, g.wrap(h))
}

func (g *Group) HandleFunc(pattern string, fn func(http.ResponseWriter, *http.Request)) {
	g.Handle(pattern, http.HandlerFunc(fn))
}

// ApplyIf applies the provided middleware only when match returns true for the request.
func ApplyIf(match func(*http.Request) bool, constructors ...MiddlewareConstructor) MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		wrapped := Chain(constructors...)(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if match(r) {
				wrapped.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Paths returns a matcher that matches exact request paths.
func Paths(paths ...string) func(*http.Request) bool {
	set := map[string]struct{}{}
	for _, p := range paths {
		set[p] = struct{}{}
	}
	return func(r *http.Request) bool {
		_, ok := set[r.URL.Path]
		return ok
	}
}

// Prefixes returns a matcher that matches when request path has any of the prefixes.
func Prefixes(prefixes ...string) func(*http.Request) bool {
	return func(r *http.Request) bool {
		for _, pref := range prefixes {
			if len(pref) > 0 && len(r.URL.Path) >= len(pref) && r.URL.Path[:len(pref)] == pref {
				return true
			}
		}
		return false
	}
}
