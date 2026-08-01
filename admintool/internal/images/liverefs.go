package images

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/stack"
)

// LiveImageRef is one image that PullLive / ReconcileLive should manage.
type LiveImageRef struct {
	Service string // short Swarm service name (e.g. api, mongo)
	Image   string // full ref as used in stack deploy (repo:tag)
}

// LiveImageRefs returns app + data (+ obs when wantObs) image refs from stack YAML and .env.
func LiveImageRefs(home string, wantObs bool) ([]LiveImageRef, error) {
	envPath := filepath.Join(home, kit.EnvFile)
	m, err := kit.Map(envPath)
	if err != nil {
		return nil, err
	}
	appVer := kit.Get(m, "APP_VERSION")
	if appVer == "" {
		return nil, fmt.Errorf("APP_VERSION missing from %s", kit.EnvFile)
	}

	files := []string{kit.AppStackFile, kit.DataStackFile}
	if wantObs {
		files = append(files, kit.ObsStackFile)
	}
	return collectLiveImageRefs(home, files, appVer)
}

func collectLiveImageRefs(home string, relFiles []string, appVer string) ([]LiveImageRef, error) {
	type keyed struct{ svc, img string }
	var ordered []keyed
	seen := map[string]struct{}{}

	add := func(svc, img string) {
		svc = strings.TrimSpace(svc)
		img = strings.TrimSpace(img)
		if svc == "" || img == "" {
			return
		}
		key := svc + "\x00" + img
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		ordered = append(ordered, keyed{svc, img})
	}

	for _, rel := range relFiles {
		doc, err := stack.Load(filepath.Join(home, rel))
		if err != nil {
			return nil, err
		}
		names := make([]string, 0, len(doc.Services))
		for name := range doc.Services {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			img := resolveStackImage(doc.Services[name].Image, appVer)
			if img == "" {
				continue
			}
			add(name, img)
		}
	}

	out := make([]LiveImageRef, len(ordered))
	for i, k := range ordered {
		out[i] = LiveImageRef{Service: k.svc, Image: k.img}
	}
	return out, nil
}

func resolveStackImage(raw, appVer string) string {
	img := strings.TrimSpace(raw)
	if img == "" {
		return ""
	}
	img = strings.ReplaceAll(img, "${APP_VERSION}", appVer)
	img = strings.ReplaceAll(img, "${APP_VERSION:-}", appVer)
	if img == "" || strings.Contains(img, "${") {
		return ""
	}
	return img
}

// UniqueImages returns distinct image refs preserving first-seen order.
func UniqueImages(refs []LiveImageRef) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, r := range refs {
		img := strings.TrimSpace(r.Image)
		if img == "" {
			continue
		}
		if _, ok := seen[img]; ok {
			continue
		}
		seen[img] = struct{}{}
		out = append(out, img)
	}
	return out
}
