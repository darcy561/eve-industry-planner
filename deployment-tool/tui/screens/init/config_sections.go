package initui

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/kit/templates/yamldefaults"
	"eve-industry-planner/deployment-tool/tui/builder"
)

// ConfigSections builds wizard sections from yamldefaults.ConfigFields.
// cli.env_backup_path is edited in the env Operator section (Setup writes it first).
func ConfigSections() []builder.Section {
	home, _ := kit.Home()
	cfg := loadConfigOrDefault(home)
	values := yamldefaults.ValuesFromConfig(cfg)

	type bucket struct {
		title  string
		help   string
		fields []builder.Field
	}
	order := make([]string, 0)
	bySec := map[string]*bucket{}

	for _, f := range yamldefaults.ConfigFields() {
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
		kind := builder.KindText
		if f.Type == yamldefaults.FieldBool {
			kind = builder.KindBool
		}
		b.fields = append(b.fields, builder.Field{
			ID:      f.Key,
			Label:   f.Label,
			Help:    f.Help,
			Kind:    kind,
			Value:   values[f.Key],
			BoolYes: f.BoolYes,
			BoolNo:  f.BoolNo,
		})
	}

	out := make([]builder.Section, 0, len(order))
	for _, sec := range order {
		b := bySec[sec]
		out = append(out, builder.Section{
			ID:     slug(sec),
			Title:  b.title,
			Help:   b.help,
			Fields: b.fields,
		})
	}
	return out
}

// NewConfigSession builds a document builder for eip.config.yaml.
func NewConfigSession(title string) builder.Session {
	if title == "" {
		title = "EDIT CONFIG"
	}
	return builder.NewSession(title, ConfigSections())
}

// PersistConfig writes eip.config.yaml from ConfigFields values, preserving CLI
// (including env_backup_path set by the env step).
func PersistConfig(s *builder.Session) error {
	if s == nil {
		return fmt.Errorf("nil session")
	}
	values, _ := s.Collect()

	home, err := kit.Home()
	if err != nil {
		return err
	}
	cfgPath := filepath.Join(home, kit.ConfigFile)
	base := loadConfigOrDefault(home)
	cfg, err := yamldefaults.ApplyToConfig(base, values)
	if err != nil {
		return err
	}
	// Never let the config form wipe CLI — ApplyToConfig keeps base.CLI, but
	// re-assert Effective stem if somehow empty.
	if strings.TrimSpace(cfg.CLI.EnvBackupPath) == "" {
		cfg.CLI.EnvBackupPath = base.EffectiveEnvBackupPath()
	}
	if err := config.WriteYAML(cfgPath, cfg); err != nil {
		return fmt.Errorf("write %s: %w", kit.ConfigFile, err)
	}
	return nil
}

// WriteConfigDefaults writes DefaultConfig preserving CLI from the on-disk file
// (or DefaultConfig CLI when the file is missing).
func WriteConfigDefaults() error {
	home, err := kit.Home()
	if err != nil {
		return err
	}
	cfgPath := filepath.Join(home, kit.ConfigFile)
	cli := loadConfigOrDefault(home).CLI
	return yamldefaults.WriteDefaultsPreservingCLI(cfgPath, cli)
}

func loadConfigOrDefault(home string) config.Config {
	cfgPath := filepath.Join(home, kit.ConfigFile)
	cfg, err := config.LoadYAML(cfgPath)
	if err != nil {
		if _, st := os.Stat(cfgPath); errors.Is(st, fs.ErrNotExist) {
			return yamldefaults.DefaultConfig()
		}
		// Invalid / unreadable: start from defaults so the form can heal via Finish.
		return yamldefaults.DefaultConfig()
	}
	return cfg
}
