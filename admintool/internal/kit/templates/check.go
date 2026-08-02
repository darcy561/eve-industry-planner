package templates

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"eve-industry-planner/admintool/internal/config"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/kit/templates/env"
)

// CheckOperatorDocs verifies .env and eip.config.yaml exist, parse, and hold
// usable required values before ensure / service probes.
//
// Password and Autogen material strength rules are not applied here (see env.CheckUsable).
func CheckOperatorDocs(home string) error {
	for _, name := range []string{kit.EnvFile, kit.ConfigFile} {
		p := filepath.Join(home, name)
		st, err := os.Stat(p)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return fmt.Errorf("missing %s; run eip init or TUI Setup", name)
			}
			return fmt.Errorf("%s: %w", name, err)
		}
		if st.IsDir() {
			return fmt.Errorf("%s: is a directory", name)
		}
	}
	if err := env.CheckUsable(home); err != nil {
		return err
	}
	cfgPath := filepath.Join(home, kit.ConfigFile)
	if _, err := config.LoadYAML(cfgPath); err != nil {
		return fmt.Errorf("%s: %w", kit.ConfigFile, err)
	}
	return nil
}
