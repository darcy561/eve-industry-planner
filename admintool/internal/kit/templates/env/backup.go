package env

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"eve-industry-planner/admintool/internal/config"
)

const maxTimestampedEnvBackups = 3

// EmitOpts controls EmitEnv backup behavior.
type EmitOpts struct {
	// BackupStem is a path prefix (relative paths join with the .env directory).
	// Empty uses config.DefaultEnvBackupStem. Ignored when SkipBackup is true.
	BackupStem string
	// SkipBackup disables rotation (e.g. first WriteMissingEnv create).
	SkipBackup bool
	// Now overrides the clock for tests (nil → time.Now).
	Now func() time.Time
}

// ResolveBackupStem joins relative stems with home (absolute stems unchanged).
func ResolveBackupStem(home, stem string) string {
	stem = strings.TrimSpace(stem)
	if stem == "" {
		stem = config.DefaultEnvBackupStem
	}
	if filepath.IsAbs(stem) {
		return filepath.Clean(stem)
	}
	return filepath.Join(home, stem)
}

func currentBackupPath(stem string) string {
	return stem + "-current.txt"
}

func timestampBackupPath(stem string, t time.Time) string {
	return fmt.Sprintf("%s-%s.txt", stem, t.Format("20060102-150405"))
}

// backupEnvBeforeReplace rotates backups, then fails closed before the caller writes livePath.
// If livePath is missing, this is a no-op.
func backupEnvBeforeReplace(livePath, stem string, now func() time.Time) error {
	if _, err := os.Stat(livePath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if now == nil {
		now = time.Now
	}
	stem = strings.TrimSpace(stem)
	if stem == "" {
		stem = config.DefaultEnvBackupStem
	}
	if !filepath.IsAbs(stem) {
		stem = filepath.Join(filepath.Dir(livePath), stem)
	}
	stem = filepath.Clean(stem)

	if err := os.MkdirAll(filepath.Dir(stem), 0o755); err != nil {
		return fmt.Errorf("env backup dir: %w", err)
	}

	current := currentBackupPath(stem)
	if _, err := os.Stat(current); err == nil {
		ts := uniqueTimestampPath(stem, now())
		if err := os.Rename(current, ts); err != nil {
			return fmt.Errorf("rotate current backup: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	if err := pruneTimestampedBackups(stem, maxTimestampedEnvBackups); err != nil {
		return err
	}

	liveRaw, err := os.ReadFile(livePath)
	if err != nil {
		return fmt.Errorf("read live env for backup: %w", err)
	}
	if err := os.WriteFile(current, liveRaw, 0o600); err != nil {
		return fmt.Errorf("write current backup: %w", err)
	}
	return nil
}

func uniqueTimestampPath(stem string, t time.Time) string {
	p := timestampBackupPath(stem, t)
	if _, err := os.Stat(p); os.IsNotExist(err) {
		return p
	}
	for i := 1; i < 1000; i++ {
		cand := fmt.Sprintf("%s-%s-%d.txt", stem, t.Format("20060102-150405"), i)
		if _, err := os.Stat(cand); os.IsNotExist(err) {
			return cand
		}
	}
	return fmt.Sprintf("%s-%s-%d.txt", stem, t.Format("20060102-150405"), t.UnixNano())
}

func timestampedBackupRegexp(stem string) *regexp.Regexp {
	base := regexp.QuoteMeta(filepath.Base(stem))
	// stem-YYYYMMDD-HHMMSS.txt or stem-YYYYMMDD-HHMMSS-N.txt
	return regexp.MustCompile(`^` + base + `-\d{8}-\d{6}(?:-\d+)?\.txt$`)
}

func pruneTimestampedBackups(stem string, keep int) error {
	dir := filepath.Dir(stem)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	re := timestampedBackupRegexp(stem)
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if re.MatchString(name) {
			names = append(names, name)
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	if len(names) <= keep {
		return nil
	}
	for _, name := range names[keep:] {
		if err := os.Remove(filepath.Join(dir, name)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("prune backup %s: %w", name, err)
		}
	}
	return nil
}
