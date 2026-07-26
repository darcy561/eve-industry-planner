package mongo

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

// mongoDataVolume is the named volume in docker-stack.data.yml.
const mongoDataVolume = "eve-industry-planner_mongo_data"

// volumeHasDataFn probes the data volume for existing DB files (overridable in tests).
var volumeHasDataFn = mongoVolumeHasData

// mongoVolumeHasData reports whether the mongo data volume already holds DB files.
func mongoVolumeHasData() (bool, string, error) {
	exists, err := dockerVolumeExists(mongoDataVolume)
	if err != nil {
		return false, "", err
	}
	if !exists {
		return false, "", nil
	}
	has, err := volumeLooksProvisioned(mongoDataVolume)
	if err != nil {
		return false, "", err
	}
	if has {
		return true, mongoDataVolume, nil
	}
	return false, "", nil
}

func dockerVolumeExists(name string) (bool, error) {
	cmd := exec.Command("docker", "volume", "inspect", name)
	if err := cmd.Run(); err != nil {
		return false, nil
	}
	return true, nil
}

func volumeLooksProvisioned(volume string) (bool, error) {
	// WiredTiger / mongod.lock / journal indicate a real DB, not an empty mount.
	cmd := exec.Command("docker", "run", "--rm",
		"-v", volume+":/data/db:ro",
		"alpine:3.20",
		"sh", "-c",
		`test -e /data/db/WiredTiger -o -e /data/db/mongod.lock -o -e /data/db/journal`,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err == nil {
		return true, nil
	}
	if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
		return false, nil
	}
	// Image pull / docker down — treat as empty so EnsureKeyfile can still generate.
	if strings.Contains(stderr.String(), "Unable to find image") || strings.Contains(err.Error(), "executable file not found") {
		return false, nil
	}
	return false, fmt.Errorf("mongo: probe volume %s: %w\n%s", volume, err, stderr.String())
}
