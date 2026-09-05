package soaklib

import (
	"testing"
	"time"
)

func TestFanoutBootstrapEmitEvery(t *testing.T) {
	if got := fanoutBootstrapEmitEvery(30*time.Second, 500); got < fanoutBootstrapEmitMin || got > fanoutBootstrapEmitMax {
		t.Fatalf("got %s", got)
	}
	if got := fanoutBootstrapEmitEvery(0, 100); got != fanoutBootstrapEmitMin {
		t.Fatalf("zero ramp got %s", got)
	}
}
