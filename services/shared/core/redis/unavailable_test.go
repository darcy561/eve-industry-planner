package redis

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"

	goredis "github.com/redis/go-redis/v9"
)

func TestIsUnavailableError(t *testing.T) {
	dialErr := fmt.Errorf("an error has occurred with redis command: %w", &net.OpError{
		Op:  "dial",
		Net: "tcp",
		Err: errors.New(`lookup redis on 127.0.0.11:53: no such host`),
	})

	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"redis nil", goredis.Nil, false},
		{"context canceled", context.Canceled, false},
		{"dial dns", dialErr, true},
		{"redis client nil", errors.New("redis client is nil"), true},
		{"redis unavailable", errors.New("redis unavailable"), true},
		{"app logic", errors.New("session not found"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsUnavailableError(tt.err); got != tt.want {
				t.Fatalf("IsUnavailableError() = %v, want %v", got, tt.want)
			}
		})
	}
}
