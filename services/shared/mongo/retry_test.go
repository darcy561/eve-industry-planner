package mongo

import (
	"context"
	"errors"
	"testing"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

func TestIsRetryableMongoError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "canceled", err: context.Canceled, want: false},
		{name: "no documents", err: mongo.ErrNoDocuments, want: false},
		{name: "client disconnected", err: mongo.ErrClientDisconnected, want: true},
		{name: "server selection string", err: errors.New("server selection error: no reachable servers"), want: true},
		{name: "generic app error", err: errors.New("duplicate key"), want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := IsRetryableMongoError(tc.err); got != tc.want {
				t.Fatalf("IsRetryableMongoError(%v)=%v want %v", tc.err, got, tc.want)
			}
		})
	}
}
