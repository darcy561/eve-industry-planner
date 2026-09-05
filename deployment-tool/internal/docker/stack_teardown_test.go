package docker_test

import (
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/docker/enginetest"
)

// Swarm deletes a service record before its tasks stop, and a running task still
// holds its overlay endpoint — so returning as soon as the service list empties
// is what lets the following network removal fail.
func TestWaitStackGoneWaitsForTasksNotJustServices(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		engine := enginetest.New(t)
		engine.SetServiceList(0, 0, 0) // services gone from the first poll
		engine.SetTaskList(2, 1, 0)    // tasks still winding down

		if err := docker.WaitStackGone(t.Context(), engine.APIClient(), "eip", 10*time.Second); err != nil {
			t.Fatalf("want a clean wait, got %v", err)
		}
		if got := engine.TaskListCalls(); got < 3 {
			t.Fatalf("returned after %d task polls; it did not wait for tasks to drain", got)
		}
	})
}

func TestWaitStackGoneReportsWhatIsLeft(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		engine := enginetest.New(t)
		engine.SetServiceList(1)
		engine.SetTaskList(3)

		err := docker.WaitStackGone(t.Context(), engine.APIClient(), "eip", 100*time.Millisecond)
		if err == nil {
			t.Fatal("want a timeout error")
		}
		for _, frag := range []string{"1 service(s)", "3 task(s)"} {
			if !strings.Contains(err.Error(), frag) {
				t.Fatalf("error %q does not name %q", err, frag)
			}
		}
	})
}

// Removal is refused while endpoints are still held, and release trails task
// shutdown, so a single attempt is not enough.
func TestRemoveStackNetworksRetriesUntilEndpointsRelease(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		engine := enginetest.New(t)
		engine.SetNetworkList(map[string]string{"net-a": "eip-docker-capacity"})
		engine.NetworkRemoveFailures = map[string]int{"net-a": 2}

		removed, stuck, err := docker.RemoveStackNetworksIn(t.Context(), engine.APIClient(), "eip", 30*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		if removed != 1 || len(stuck) != 0 {
			t.Fatalf("removed=%d stuck=%v, want 1 and none", removed, stuck)
		}
		if got := len(engine.NetworkRemoveCalls()); got != 3 {
			t.Fatalf("%d remove attempts, want 3 (two refusals then success)", got)
		}
	})
}

// A network left behind is the one that blocks the next deploy, so it must be
// named rather than silently uncounted.
func TestRemoveStackNetworksNamesWhatItCouldNotRemove(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		engine := enginetest.New(t)
		engine.SetNetworkList(map[string]string{"net-a": "eip-docker-capacity", "net-b": "eip-public"})
		engine.NetworkRemoveFailures = map[string]int{"net-a": 1000}

		removed, stuck, err := docker.RemoveStackNetworksIn(t.Context(), engine.APIClient(), "eip", 30*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		if removed != 1 {
			t.Fatalf("removed=%d, want the one that could go", removed)
		}
		if len(stuck) != 1 || !strings.Contains(stuck[0], "eip-docker-capacity") {
			t.Fatalf("stuck=%v, want it to name eip-docker-capacity", stuck)
		}
		if !strings.Contains(stuck[0], "active endpoints") {
			t.Fatalf("stuck=%v, want it to carry the reason", stuck)
		}
	})
}
