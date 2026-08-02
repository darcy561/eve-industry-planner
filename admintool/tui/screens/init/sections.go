// Package initui is the first-run / document wizard: sections from env registry + yamldefaults.
package initui

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"eve-industry-planner/admintool/internal/config"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/kit/templates/env"
	"eve-industry-planner/admintool/internal/kit/templates/yamldefaults"
	"eve-industry-planner/admintool/tui/builder"
)

const fieldEnvBackupPath = "cli.env_backup_path"

// Sections is EnvSections (env + operator backup path).
func Sections() []builder.Section {
	return EnvSections()
}

// EnvSections builds wizard sections from EnvFields + operator CLI backup path.
func EnvSections() []builder.Section {
	home, _ := kit.Home()
	envPath := filepath.Join(home, kit.EnvFile)
	values, err := env.LoadEnvValues(envPath)
	if err != nil {
		values = env.DefaultEnvValues()
	}

	type bucket struct {
		title  string
		help   string
		fields []builder.Field
	}
	order := make([]string, 0)
	bySec := map[string]*bucket{}

	for _, f := range env.EnvFields() {
		if f.Hidden {
			continue
		}
		sec := f.Section
		if sec == "" {
			sec = "General"
		}
		b := bySec[sec]
		if b == nil {
			b = &bucket{title: sec, help: sec}
			bySec[sec] = b
			order = append(order, sec)
		}
		bf := builderFieldFromEnv(f, values[f.Key])
		b.fields = append(b.fields, bf)
	}

	out := make([]builder.Section, 0, len(order)+1)
	for _, sec := range order {
		b := bySec[sec]
		out = append(out, builder.Section{
			ID:     slug(sec),
			Title:  b.title,
			Help:   b.help,
			Fields: b.fields,
		})
	}

	backup := loadBackupStem(home)
	backupStatus := backupPathStatus(home, backup)
	out = append(out, builder.Section{
		ID:    "operator",
		Title: "Operator",
		Help:  "Local eip/TUI settings (not shipped into containers).",
		Fields: []builder.Field{
			{
				ID:     fieldEnvBackupPath,
				Label:  "Env backup path",
				Help:   "Stem for .env backups (relative to project home, or absolute). Empty → " + config.DefaultEnvBackupStem,
				Kind:   builder.KindText,
				Value:  backup,
				Status: backupStatus,
				Validate: func(v string) string {
					return backupPathStatus(home, v)
				},
			},
		},
	})
	return out
}

// builderFieldFromEnv maps an EnvField + on-disk value into builder UI flags.
// Autogen checkbox: first create only. Roll: day-2 for non-Locked Autogen secrets.
// Once a secret exists, the value is read-only (manual password update unsupported).
func builderFieldFromEnv(f env.EnvField, cur string) builder.Field {
	locked := env.IsLockedInFile(f, cur)
	showAutogen := env.ShowAutogenCheckbox(f, cur)
	showRoll := env.ShowRollCheckbox(f, cur)
	// Passwords/keys are plain text here (local ops TUI — visible + copy/paste).
	kind := builder.KindText
	genOn := false
	if showAutogen {
		genOn = env.DefaultGenerateFlag(f, cur)
	}
	bf := builder.Field{
		ID:        f.Key,
		Label:     f.Label,
		Help:      f.Help,
		Kind:      kind,
		Value:     cur,
		Autogen:   showAutogen,
		AllowRoll: showRoll,
		AutogenOn: genOn,
		Locked:    locked,
	}
	if f.Autogen {
		_, msg := env.ClassifyAutogenCheckbox(f, cur, genOn, locked)
		bf.Status = msg
		if showRoll && !locked {
			if f.Key == "REFRESH_TOKEN_AES_KEY" {
				bf.Status = "Set — Roll on save regenerates key, bumps version, keeps old key in legacy"
			} else {
				bf.Status = "Set — check Roll on save to regenerate"
			}
		} else if showAutogen && !genOn && msg == "" {
			bf.Status = env.RuleHelp(f.Type)
		}
	}
	return bf
}

func backupPathStatus(home, stem string) string {
	if err := env.CheckBackupStemWritable(home, stem); err != nil {
		return err.Error()
	}
	return "OK — backup directory is writable"
}

func loadBackupStem(home string) string {
	cfgPath := filepath.Join(home, kit.ConfigFile)
	cfg, err := config.LoadYAML(cfgPath)
	if err != nil {
		return yamldefaults.DefaultConfig().EffectiveEnvBackupPath()
	}
	return cfg.EffectiveEnvBackupPath()
}

func slug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, "/", "-")
	return s
}

// NewSession builds a full-body env document builder (Setup env step / Edit env).
func NewSession() builder.Session {
	return NewEnvSession("SETUP")
}

// NewEnvSession builds the .env (+ cli.env_backup_path) document builder.
func NewEnvSession(title string) builder.Session {
	if title == "" {
		title = "SETUP"
	}
	return builder.NewSession(title, EnvSections())
}

// Persist is PersistEnv (tests / callers).
func Persist(s *builder.Session) error {
	return PersistEnv(s)
}

// PersistEnv writes .env (ResolveEnvFields + EmitEnv) and updates
// eip.config.yaml cli.env_backup_path only (creates DefaultConfig if missing).
func PersistEnv(s *builder.Session) error {
	if s == nil {
		return fmt.Errorf("nil session")
	}
	values, generate := s.Collect()
	backupStem := strings.TrimSpace(values[fieldEnvBackupPath])
	delete(values, fieldEnvBackupPath)

	home, err := kit.Home()
	if err != nil {
		return err
	}
	envPath := filepath.Join(home, kit.EnvFile)
	// Hidden keys (e.g. AES version) are not in the TUI Collect map — keep on-disk values.
	disk, _ := env.LoadEnvValues(envPath)

	envVals := make(map[string]string, len(env.EnvFields()))
	for _, f := range env.EnvFields() {
		if v, ok := values[f.Key]; ok {
			envVals[f.Key] = v
			continue
		}
		if disk != nil {
			if v, ok := disk[f.Key]; ok {
				envVals[f.Key] = v
				continue
			}
		}
		envVals[f.Key] = f.Default
	}

	resolved, err := env.ResolveEnvFields(envVals, generate)
	if err != nil {
		return err
	}
	if err := env.CheckBackupStemWritable(home, backupStem); err != nil {
		return err
	}
	if err := kit.EnsureFileWritable(envPath); err != nil {
		return fmt.Errorf("cannot write .env: %w", err)
	}
	if err := env.EmitEnvOpts(envPath, resolved, env.EmitOpts{BackupStem: backupStem}); err != nil {
		return err
	}

	cfgPath := filepath.Join(home, kit.ConfigFile)
	cfg, err := config.LoadYAML(cfgPath)
	if err != nil {
		if _, st := os.Stat(cfgPath); errors.Is(st, fs.ErrNotExist) {
			cfg = yamldefaults.DefaultConfig()
		} else {
			return fmt.Errorf("load %s: %w", kit.ConfigFile, err)
		}
	}
	cfg.CLI.EnvBackupPath = backupStem
	if err := config.WriteYAML(cfgPath, cfg); err != nil {
		return fmt.Errorf("write %s: %w", kit.ConfigFile, err)
	}
	return nil
}
