package main

import (
	"testing"

	"eve-industry-planner/shared/jsoncodec"
)

// Docker's task JSON names its fields in PascalCase, and a field matched by name
// is matched exactly — a tag spelled any other way reads as absent rather than
// as an error, so the router would find no backends and say nothing about why.
// This is that shape as the daemon sends it.
func TestDockerTaskDecodeReadsEveryField(t *testing.T) {
	t.Parallel()

	body := `[{
	  "ID":"task1",
	  "Slot":3,
	  "Status":{"State":"running","ContainerStatus":{"ContainerID":"c0ffee"}},
	  "Spec":{"ContainerSpec":{"Env":["EIP_ROLE=websocket"]}},
	  "NetworksAttachments":[{"Addresses":["10.0.1.7/24"]}],
	  "DesiredState":"running"
	}]`

	var tasks dockerTaskList
	if err := jsoncodec.Unmarshal([]byte(body), &tasks); err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 {
		t.Fatalf("decoded %d tasks", len(tasks))
	}
	got := tasks[0]
	if got.Slot != 3 {
		t.Errorf("Slot = %d, want 3", got.Slot)
	}
	if got.Status.State != "running" {
		t.Errorf("Status.State = %q", got.Status.State)
	}
	if got.Status.ContainerStatus.ContainerID != "c0ffee" {
		t.Errorf("ContainerID = %q", got.Status.ContainerStatus.ContainerID)
	}
	if len(got.Spec.ContainerSpec.Env) != 1 || got.Spec.ContainerSpec.Env[0] != "EIP_ROLE=websocket" {
		t.Errorf("Env = %v", got.Spec.ContainerSpec.Env)
	}
	if len(got.NetworksAttachments) != 1 || len(got.NetworksAttachments[0].Addresses) != 1 {
		t.Errorf("NetworksAttachments = %v", got.NetworksAttachments)
	}
}

// Docker adds fields between versions, so an unrecognised one must be ignored
// rather than refused: the router cannot stop finding backends because the
// daemon was upgraded.
func TestDockerTaskDecodeToleratesNewFields(t *testing.T) {
	t.Parallel()

	var tasks dockerTaskList
	err := jsoncodec.Unmarshal([]byte(`[{"Slot":1,"SomethingDockerAddedLater":{"a":1}}]`), &tasks)
	if err != nil {
		t.Fatalf("an unrecognised daemon field must not stop the decode: %v", err)
	}
	if len(tasks) != 1 || tasks[0].Slot != 1 {
		t.Fatalf("decoded %+v", tasks)
	}
}
