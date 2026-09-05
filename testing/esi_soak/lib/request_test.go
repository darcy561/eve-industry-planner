package esisoak_test

import "net/http"

func newRequest(url string) (*http.Request, error) {
	return http.NewRequest(http.MethodGet, url, nil)
}
