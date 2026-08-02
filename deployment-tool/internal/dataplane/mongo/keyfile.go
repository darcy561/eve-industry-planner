package mongo

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
)

// keyfileRandBytes: openssl rand -base64 756 (756 bytes of entropy, base64-encoded).
const keyfileRandBytes = 756

// keyFileBak is the local spare next to ./mongo-keyfile (gitignored).
const keyFileBak = "mongo-keyfile.bak"

// KeyfilePath returns project-home ./mongo-keyfile.
func KeyfilePath() (string, error) {
	home, err := kit.Home()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, keyFileName), nil
}

func keyfileBakPath() (string, error) {
	home, err := kit.Home()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, keyFileBak), nil
}

// resolveKeyfilePaths returns host SoT path and sibling .bak.
func resolveKeyfilePaths() (path, bak string, err error) {
	path, err = KeyfilePath()
	if err != nil {
		return "", "", err
	}
	bak, err = keyfileBakPath()
	if err != nil {
		return "", "", err
	}
	return path, bak, nil
}

func keyfilePresent(path string) bool {
	st, err := os.Stat(path)
	return err == nil && !st.IsDir() && st.Size() > 0
}

// EnsureKeyfile ensures project-home ./mongo-keyfile exists:
//  1. present → refresh .bak
//  2. missing, .bak present → restore from .bak
//  3. missing, no .bak, volume has data → error (use restore-mongo-keyfile / rekey-mongo / off-box backup)
//  4. missing, no .bak, empty volume → generate keyfile + .bak
func EnsureKeyfile() error {
	path, bak, err := resolveKeyfilePaths()
	if err != nil {
		return err
	}

	if keyfilePresent(path) {
		if err := copyKeyfile(path, bak); err != nil {
			msg.Line("warn: could not refresh " + keyFileBak + ": " + err.Error())
		}
		return nil
	}

	if keyfilePresent(bak) {
		if err := copyKeyfile(bak, path); err != nil {
			return fmt.Errorf("mongo: restore %s from %s: %w", keyFileName, keyFileBak, err)
		}
		_ = os.Chmod(path, 0o600)
		msg.Line("restored " + keyFileName + " from " + keyFileBak)
		return nil
	}

	hasData, vol, err := volumeHasDataFn()
	if err != nil {
		return err
	}
	if hasData {
		return fmt.Errorf("mongo: missing %s (and %s) but volume %s already has data — run eip restore-mongo-keyfile if the task is still up, eip rekey-mongo if the stack is down and you have MONGO_ROOT_*, or restore the original keyfile from backup", keyFileName, keyFileBak, vol)
	}

	return writeGeneratedKeyfile(path, bak, "wrote")
}

// writeKeyfileContents generates a new keyfile body and writes it to path (chmod 600).
func writeKeyfileContents(path string) error {
	raw := make([]byte, keyfileRandBytes)
	if _, err := rand.Read(raw); err != nil {
		return fmt.Errorf("mongo: generate keyfile: %w", err)
	}
	// Mongo keyFile: 6–1024 chars, no newlines.
	body := strings.TrimRight(base64.StdEncoding.EncodeToString(raw), "\n\r")
	return atomicWrite600(path, []byte(body))
}

// writeGeneratedKeyfile creates a new keyfile and refreshes .bak.
func writeGeneratedKeyfile(path, bak, verb string) error {
	if err := writeKeyfileContents(path); err != nil {
		return err
	}
	return installKeyfileSoT(path, path, bak, verb)
}

// installKeyfileSoT copies src → path (when different), chmod 600, refreshes .bak.
// Bak write failures are logged as warnings; the host keyfile SoT is still considered installed.
func installKeyfileSoT(src, path, bak, verb string) error {
	if src != path {
		if err := copyKeyfile(src, path); err != nil {
			return err
		}
	}
	_ = os.Chmod(path, 0o600)
	if err := copyKeyfile(path, bak); err != nil {
		msg.Line(verb + " " + keyFileName + " (warn: could not write " + keyFileBak + ": " + err.Error() + ")")
		return nil
	}
	msg.Line(verb + " " + keyFileName + " + " + keyFileBak + " (chmod 600)")
	return nil
}

func copyKeyfile(src, dst string) error {
	raw, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return atomicWrite600(dst, raw)
}

func atomicWrite600(path string, raw []byte) error {
	tmp := path + ".tmp"
	_ = os.Remove(tmp)
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return fmt.Errorf("mongo: write %s: %w", filepath.Base(path), err)
	}
	// Docker creates an empty directory at the bind path when the host file was missing.
	if st, err := os.Stat(path); err == nil && st.IsDir() {
		if err := os.RemoveAll(path); err != nil {
			_ = os.Remove(tmp)
			return fmt.Errorf("mongo: remove blocking directory %s: %w", filepath.Base(path), err)
		}
	}
	if err := os.Rename(tmp, path); err != nil {
		// Windows often cannot rename over a bind-mounted file; overwrite in place.
		if err2 := os.WriteFile(path, raw, 0o600); err2 != nil {
			_ = os.Remove(tmp)
			return fmt.Errorf("mongo: install %s: %w", filepath.Base(path), err)
		}
		_ = os.Remove(tmp)
	}
	_ = os.Chmod(path, 0o600)
	return nil
}

// containerKeyfilePaths: /tmp is what auth-first CMD uses for mongod --keyFile;
// /etc is the bind mount and may already be a wrongly regenerated host file.
var containerKeyfilePaths = []string{
	"/tmp/mongo-keyfile",
	"/etc/mongo-keyfile",
}

// Test hooks for RestoreKeyfileFromContainer.
var (
	lookupMongoContainerFn  = containerID
	containerPathNonEmptyFn = containerPathNonEmpty
	copyFromContainerFn     = dockerCopyFromContainer
)

// RestoreKeyfileFromContainer copies the live keyfile from a running mongo task
// to ./mongo-keyfile and refreshes .bak. Prefers /tmp over the /etc bind mount.
func RestoreKeyfileFromContainer(ctx context.Context, stackName string) error {
	cid, err := lookupMongoContainerFn(ctx, stackName)
	if err != nil {
		return err
	}
	if cid == "" {
		return fmt.Errorf("mongo: no running task — start mongo, then eip restore-mongo-keyfile")
	}

	src, err := pickContainerKeyfile(ctx, cid)
	if err != nil {
		return err
	}

	path, bak, err := resolveKeyfilePaths()
	if err != nil {
		return err
	}

	tmp := path + ".from-container.tmp"
	_ = os.Remove(tmp)
	defer func() { _ = os.Remove(tmp) }()

	if err := copyFromContainerFn(ctx, cid, src, tmp); err != nil {
		return fmt.Errorf("mongo: docker cp %s:%s: %w", shortCID(cid), src, err)
	}
	if !keyfilePresent(tmp) {
		return fmt.Errorf("mongo: copied keyfile from %s is empty", src)
	}
	if err := copyKeyfile(tmp, path); err != nil {
		return fmt.Errorf("mongo: install %s: %w", keyFileName, err)
	}
	_ = os.Chmod(path, 0o600)
	if err := copyKeyfile(path, bak); err != nil {
		msg.Line("restored " + keyFileName + " from container " + src + " (warn: could not write " + keyFileBak + ": " + err.Error() + ")")
		return nil
	}
	msg.Line("restored " + keyFileName + " + " + keyFileBak + " from container " + src)
	return nil
}

func pickContainerKeyfile(ctx context.Context, cid string) (string, error) {
	for _, p := range containerKeyfilePaths {
		ok, err := containerPathNonEmptyFn(ctx, cid, p)
		if err != nil {
			return "", err
		}
		if ok {
			return p, nil
		}
	}
	return "", fmt.Errorf("mongo: no non-empty keyfile in container at %s", strings.Join(containerKeyfilePaths, " or "))
}

func containerPathNonEmpty(ctx context.Context, cid, path string) (bool, error) {
	cmd := exec.CommandContext(ctx, "docker", "exec", cid, "test", "-s", path)
	if err := cmd.Run(); err != nil {
		if _, ok := errors.AsType[*exec.ExitError](err); ok {
			return false, nil
		}
		return false, fmt.Errorf("mongo: probe %s in container: %w", path, err)
	}
	return true, nil
}

func dockerCopyFromContainer(ctx context.Context, cid, src, dst string) error {
	cmd := exec.CommandContext(ctx, "docker", "cp", cid+":"+src, dst)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%w\n%s", err, stderr.String())
	}
	return nil
}

func shortCID(cid string) string {
	if len(cid) > 12 {
		return cid[:12]
	}
	return cid
}
