package health

import (
	"context"
	"testing"
)

func TestDeps_nilClients(t *testing.T) {
	if err := Deps(nil).Ready(context.Background()); err == nil {
		t.Fatal("expected error for nil clients")
	}
}
