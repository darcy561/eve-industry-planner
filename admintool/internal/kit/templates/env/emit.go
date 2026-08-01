package env

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"eve-industry-planner/admintool/internal/config"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/yamlutil"
)

const (
	envFileHeader = `# .env — secrets and APP_VERSION (written by eip).
# Non-secret scale/ports/paths: eip.config.yaml.
`
	preservedSectionHeader = `# --- unrecognized / preserved ---
# Keys below are not in the current schema; kept as-is so nothing is wiped.
`
)

// DefaultEnvValues returns registry defaults keyed by current Key.
func DefaultEnvValues() map[string]string {
	fields := EnvFields()
	out := make(map[string]string, len(fields))
	for _, f := range fields {
		out[f.Key] = f.Default
	}
	return out
}

// LoadEnvFile reads path into a map. Missing file → empty map (not an error).
func LoadEnvFile(path string) (map[string]string, error) {
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return map[string]string{}, nil
		}
		return nil, err
	}
	return kit.Map(path)
}

// LoadEnvValues loads path and resolves each EnvField (Key, else PreviousKeys, else Default).
// Returned map is keyed only by current Key names.
func LoadEnvValues(path string) (map[string]string, error) {
	file, err := LoadEnvFile(path)
	if err != nil {
		return nil, err
	}
	return ResolveEnvValues(file), nil
}

// ResolveEnvValues maps a raw file map onto current EnvField keys (PreviousKeys migrate).
func ResolveEnvValues(file map[string]string) map[string]string {
	fields := EnvFields()
	out := make(map[string]string, len(fields))
	for _, f := range fields {
		out[f.Key] = resolveFieldValue(f, file)
	}
	return out
}

func resolveFieldValue(f EnvField, file map[string]string) string {
	if file == nil {
		return f.Default
	}
	if v, ok := file[f.Key]; ok {
		return v
	}
	for _, prev := range f.PreviousKeys {
		if prev == "" {
			continue
		}
		if v, ok := file[prev]; ok {
			return v
		}
	}
	return f.Default
}

// EmitEnv writes path as a full rebuild from values (current keys) plus unrecognized
// keys from any existing file at path. Optional empty fields are emitted commented.
// When path already exists, rotates env backups (1 current + 3 timestamped) first.
func EmitEnv(path string, values map[string]string) error {
	return EmitEnvOpts(path, values, EmitOpts{})
}

// EmitEnvOpts is EmitEnv with backup options.
func EmitEnvOpts(path string, values map[string]string, opts EmitOpts) error {
	if err := preflightEmitPaths(path, opts); err != nil {
		return err
	}
	existing, err := LoadEnvFile(path)
	if err != nil {
		return err
	}
	raw, err := FormatEnvFile(values, existing)
	if err != nil {
		return err
	}
	if !opts.SkipBackup {
		stem := opts.BackupStem
		if strings.TrimSpace(stem) == "" {
			stem = config.DefaultEnvBackupStem
		}
		if err := backupEnvBeforeReplace(path, stem, opts.Now); err != nil {
			return fmt.Errorf("env backup failed (live .env not modified): %w", err)
		}
	}
	return yamlutil.WriteFile(path, raw, 0o600)
}

// preflightEmitPaths fails closed before backup rotation or live .env replace.
func preflightEmitPaths(path string, opts EmitOpts) error {
	if err := kit.EnsureFileWritable(path); err != nil {
		return fmt.Errorf("cannot write .env: %w", err)
	}
	if opts.SkipBackup {
		return nil
	}
	stem := strings.TrimSpace(opts.BackupStem)
	if stem == "" {
		stem = config.DefaultEnvBackupStem
	}
	if !filepath.IsAbs(stem) {
		stem = filepath.Join(filepath.Dir(path), stem)
	}
	stem = filepath.Clean(stem)
	if err := kit.EnsureDirWritable(filepath.Dir(stem)); err != nil {
		return fmt.Errorf("cli.env_backup_path not writable (live .env not modified): %w", err)
	}
	return nil
}

// CheckBackupStemWritable reports whether backups can be written for stem
// (relative stems join home). Does not create directories — for live TUI checks.
func CheckBackupStemWritable(home, stem string) error {
	resolved := ResolveBackupStem(home, stem)
	if err := kit.CheckDirWritable(filepath.Dir(resolved)); err != nil {
		return fmt.Errorf("backup path not writable: %w", err)
	}
	return nil
}

// FormatEnvFile builds .env bytes from values (current keys) and existing (for preserved extras).
func FormatEnvFile(values map[string]string, existing map[string]string) ([]byte, error) {
	if values == nil {
		values = map[string]string{}
	}
	fields := EnvFields()
	known := knownEnvKeySet()

	var b strings.Builder
	b.WriteString(envFileHeader)
	b.WriteByte('\n')

	lastSection := ""
	for _, f := range fields {
		if f.Section != lastSection {
			if lastSection != "" {
				b.WriteByte('\n')
			}
			b.WriteString("# ============================================\n")
			b.WriteString("# " + f.Section + "\n")
			b.WriteString("# ============================================\n")
			lastSection = f.Section
		}
		if f.Help != "" {
			for _, line := range wrapHelpLines(f.Help) {
				b.WriteString("# " + line + "\n")
			}
		}
		val, ok := values[f.Key]
		if !ok {
			val = f.Default
		}
		// Optional empty: prefer Default when set (e.g. LEGACY_KEYS={}) so CLI .env
		// shows the expected structure; otherwise emit a commented placeholder.
		if !f.Required && strings.TrimSpace(val) == "" {
			if d := strings.TrimSpace(f.Default); d != "" {
				val = d
			} else {
				b.WriteString("# " + f.Key + "=\n")
				b.WriteByte('\n')
				continue
			}
		}
		b.WriteString(f.Key)
		b.WriteByte('=')
		b.WriteString(formatEnvValue(val))
		b.WriteByte('\n')
		b.WriteByte('\n')
	}

	preserved := preservedKeys(existing, known)
	if len(preserved) > 0 {
		b.WriteByte('\n')
		b.WriteString(preservedSectionHeader)
		keys := make([]string, 0, len(preserved))
		for k := range preserved {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			b.WriteString(k)
			b.WriteByte('=')
			b.WriteString(formatEnvValue(preserved[k]))
			b.WriteByte('\n')
		}
	}
	return []byte(b.String()), nil
}

func preservedKeys(existing map[string]string, known map[string]struct{}) map[string]string {
	if existing == nil {
		return nil
	}
	out := map[string]string{}
	for k, v := range existing {
		if k == "" {
			continue
		}
		if _, ok := known[k]; ok {
			continue
		}
		out[k] = v
	}
	return out
}

func formatEnvValue(v string) string {
	if v == "" {
		return ""
	}
	// Prefer unquoted when safe (HMAC, AES base64, empty JSON {}).
	// JSON with "…" uses single quotes so the file stays readable:
	//   REFRESH_TOKEN_AES_LEGACY_KEYS='{"v1":"<base64>"}'
	// godotenv: single quotes are literal; double quotes expand $ and need \" escapes.
	if !envValueNeedsQuotes(v) {
		return v
	}
	if strings.Contains(v, `"`) && !strings.Contains(v, "'") {
		return "'" + v + "'"
	}
	if strings.Contains(v, "$") && !strings.Contains(v, "'") {
		return "'" + v + "'"
	}
	return strconv.Quote(v)
}

func envValueNeedsQuotes(v string) bool {
	if strings.HasPrefix(v, "#") {
		return true
	}
	return strings.ContainsAny(v, " \t\n\"'#$")
}

func wrapHelpLines(help string) []string {
	help = strings.TrimSpace(help)
	if help == "" {
		return nil
	}
	const width = 88
	words := strings.Fields(help)
	var lines []string
	var cur strings.Builder
	for _, w := range words {
		if cur.Len() == 0 {
			cur.WriteString(w)
			continue
		}
		if cur.Len()+1+len(w) > width {
			lines = append(lines, cur.String())
			cur.Reset()
			cur.WriteString(w)
			continue
		}
		cur.WriteByte(' ')
		cur.WriteString(w)
	}
	if cur.Len() > 0 {
		lines = append(lines, cur.String())
	}
	return lines
}
