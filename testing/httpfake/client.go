package httpfake

import (
	"eve-industry-planner/shared/httpclient"
)

// Config returns an httpclient.Config wired to this fake. The fake has no
// address, so a client built any other way cannot reach it.
//
//	fake := httpfake.New(t)
//	fake.SetJSON(http.MethodGet, "/status/", 200, `{"players":30000}`)
//	client := httpclient.New(fake.Config())
func (s *Server) Config() httpclient.Config {
	return httpclient.Config{
		BaseURL:   s.BaseURL(),
		Transport: s.Client().Transport,
	}
}

// NewClient is Config built into a client, for a test that needs no overrides.
// Pass a function to adjust the config first — to attach a Gate, say.
func (s *Server) NewClient(adjust ...func(*httpclient.Config)) *httpclient.Client {
	cfg := s.Config()
	for _, fn := range adjust {
		fn(&cfg)
	}
	return httpclient.New(cfg)
}
