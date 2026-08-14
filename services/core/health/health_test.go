package health

import (
	"context"
	"errors"
	"testing"
)

func TestCheck_liveNotSnapshot(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	ok := true
	Register(Func{
		ComponentName: "probe",
		Fn: func(context.Context) error {
			if !ok {
				return errors.New("down")
			}
			return nil
		},
	})

	if err := Check(context.Background()); err != nil {
		t.Fatalf("want nil: %v", err)
	}
	ok = false
	if err := Check(context.Background()); err == nil {
		t.Fatal("want error after flip")
	}
}
