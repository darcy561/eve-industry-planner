package ops

import (
	"testing"
	"testing/synctest"
	"time"

	"github.com/moby/moby/api/types/swarm"

	"eve-industry-planner/deployment-tool/internal/docker/enginetest"
)

// resolveCapacityContainer polls the Engine until a single running
// capacity-controller exists and the service is not mid-roll. enginetest is an
// in-memory server, so these run inside a synctest bubble and the poll/wait
// budget is simulated rather than waited out.

const capacitySvc = "eip_capacity-controller"

func updatingService(state swarm.UpdateState) swarm.Service {
	return swarm.Service{UpdateStatus: &swarm.UpdateStatus{State: state}}
}

func TestResolveCapacityContainerWaitsForSingleOwner(t *testing.T) {
	t.Setenv("EIP_CAPACITY_SERVICE", capacitySvc)
	t.Setenv("EIP_CAPACITY_WAIT_SEC", "120")
	t.Setenv("EIP_CAPACITY_POLL_SEC", "2")

	synctest.Test(t, func(t *testing.T) {
		eng := enginetest.New(t)
		eng.SetServiceOK(capacitySvc, updatingService(swarm.UpdateStateCompleted))
		// Mid-roll two replicas, then briefly none, then the settled single owner.
		eng.QueueContainerList("cap-a", "cap-b")
		eng.QueueContainerList("cap-a", "cap-b")
		eng.QueueContainerList("cap-b")

		start := time.Now()
		got, err := resolveCapacityContainer(t.Context(), eng.APIClient())
		if err != nil {
			t.Fatalf("resolveCapacityContainer: %v", err)
		}
		if got.Name != "cap-b" {
			t.Errorf("container = %q, want cap-b", got.Name)
		}
		// Two polls at 2s before the third list settled.
		if want := 4 * time.Second; time.Since(start) != want {
			t.Errorf("elapsed = %v, want %v", time.Since(start), want)
		}
	})
}

func TestResolveCapacityContainerTimesOut(t *testing.T) {
	t.Setenv("EIP_CAPACITY_SERVICE", capacitySvc)
	t.Setenv("EIP_CAPACITY_WAIT_SEC", "60")
	t.Setenv("EIP_CAPACITY_POLL_SEC", "5")

	synctest.Test(t, func(t *testing.T) {
		eng := enginetest.New(t)
		// Stuck mid-roll with one replica: never a settled sole owner.
		eng.SetServiceOK(capacitySvc, updatingService(swarm.UpdateStateUpdating))
		eng.SetContainerList("cap-a")

		start := time.Now()
		_, err := resolveCapacityContainer(t.Context(), eng.APIClient())
		if err == nil {
			t.Fatal("resolveCapacityContainer: want timeout error, got nil")
		}
		if got := time.Since(start); got < 60*time.Second {
			t.Errorf("gave up after %v, want >= 60s", got)
		}
	})
}

func TestResolveCapacityContainerNoneRunning(t *testing.T) {
	t.Setenv("EIP_CAPACITY_SERVICE", capacitySvc)
	t.Setenv("EIP_CAPACITY_WAIT_SEC", "60")
	t.Setenv("EIP_CAPACITY_POLL_SEC", "5")

	synctest.Test(t, func(t *testing.T) {
		eng := enginetest.New(t)
		// Settled but nothing running: fail fast rather than wait out the budget.
		eng.SetServiceOK(capacitySvc, updatingService(swarm.UpdateStateCompleted))
		eng.SetContainerList()

		start := time.Now()
		if _, err := resolveCapacityContainer(t.Context(), eng.APIClient()); err == nil {
			t.Fatal("want error for no running containers, got nil")
		}
		if got := time.Since(start); got != 0 {
			t.Errorf("elapsed = %v, want immediate failure", got)
		}
	})
}

func TestResolveCapacityContainerServiceMissing(t *testing.T) {
	t.Setenv("EIP_CAPACITY_SERVICE", capacitySvc)

	synctest.Test(t, func(t *testing.T) {
		eng := enginetest.New(t)
		eng.SetServiceMissing(capacitySvc)

		if _, err := resolveCapacityContainer(t.Context(), eng.APIClient()); err == nil {
			t.Fatal("want error when service is not deployed, got nil")
		}
	})
}

func TestResolveCapacityContainerOverrideSkipsEngine(t *testing.T) {
	t.Setenv("EIP_CAPACITY_CONTAINER", "manual-override")

	synctest.Test(t, func(t *testing.T) {
		eng := enginetest.New(t)
		// No routes configured: the override must not touch the Engine at all.
		got, err := resolveCapacityContainer(t.Context(), eng.APIClient())
		if err != nil {
			t.Fatalf("resolveCapacityContainer: %v", err)
		}
		if got.Name != "manual-override" {
			t.Errorf("container = %q, want manual-override", got.Name)
		}
	})
}
