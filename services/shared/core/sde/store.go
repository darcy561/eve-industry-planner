package sde

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"eve-industry-planner/shared/core/objectstore"
)

const (
	LiveDataPrefix         = LiveDataDirName + "/"
	PreviousVersionsPrefix = "previous_versions/"
	VersionObjectKey       = VersionFileName
	VersionLockObjectKey   = "sde_version_lock.json"
	MaxPreviousVersions    = 5
)

type VersionLock struct {
	Version     string    `json:"version"`
	BuildNumber int       `json:"build_number"`
	LockedAt    time.Time `json:"locked_at"`
	Source      string    `json:"source,omitempty"`
	Reason      string    `json:"reason,omitempty"`
}

func LiveKey(fileName string) string {
	return LiveDataPrefix + strings.TrimPrefix(fileName, "/")
}

func PreviousVersionKey(versionName, fileName string) string {
	versionName = strings.Trim(versionName, "/")
	fileName = strings.TrimPrefix(fileName, "/")
	return PreviousVersionsPrefix + versionName + "/" + fileName
}

// GetLiveFile reads an object from live_data/<fileName>.
func GetLiveFile(ctx context.Context, b objectstore.Backend, fileName string) ([]byte, error) {
	return b.Get(ctx, LiveKey(fileName))
}

func ReadRootVersionJSON(ctx context.Context, b objectstore.Backend) (*VersionJSON, error) {
	return ReadVersionJSON(ctx, b, VersionObjectKey)
}

func WriteRootVersionJSON(ctx context.Context, b objectstore.Backend, v VersionJSON) error {
	return WriteVersionJSON(ctx, b, VersionObjectKey, v)
}

// ReadVersionJSON reads and unmarshals version metadata at key. Missing object → nil, nil.
func ReadVersionJSON(ctx context.Context, b objectstore.Backend, key string) (*VersionJSON, error) {
	data, err := b.Get(ctx, key)
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			return nil, nil
		}
		return nil, err
	}
	var v VersionJSON
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, err
	}
	return &v, nil
}

// WriteVersionJSON marshals and writes version metadata at key.
func WriteVersionJSON(ctx context.Context, b objectstore.Backend, key string, v VersionJSON) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return b.Put(ctx, key, data)
}

func ReadVersionLock(ctx context.Context, b objectstore.Backend) (*VersionLock, error) {
	data, err := b.Get(ctx, VersionLockObjectKey)
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			return nil, nil
		}
		return nil, err
	}
	var lock VersionLock
	if err := json.Unmarshal(data, &lock); err != nil {
		return nil, err
	}
	return &lock, nil
}

func WriteVersionLock(ctx context.Context, b objectstore.Backend, lock VersionLock) error {
	if lock.LockedAt.IsZero() {
		lock.LockedAt = time.Now().UTC()
	}
	data, err := json.MarshalIndent(lock, "", "  ")
	if err != nil {
		return err
	}
	return b.Put(ctx, VersionLockObjectKey, data)
}

// RequiredLiveReady is true when root version.json and all required live SDE files exist and are non-empty.
func RequiredLiveReady(ctx context.Context, b objectstore.Backend) (bool, error) {
	ok, err := b.Exists(ctx, VersionObjectKey)
	if err != nil || !ok {
		return false, err
	}
	for _, name := range OutputFileNames() {
		exists, err := b.Exists(ctx, LiveKey(name))
		if err != nil {
			return false, err
		}
		if !exists {
			return false, nil
		}
		info, err := b.Stat(ctx, LiveKey(name))
		if err != nil {
			return false, err
		}
		if info.Size == 0 {
			return false, nil
		}
	}
	return true, nil
}
