// Package kit names and Require()s project-home files for eip bring-up.
// eip init writes missing .env / eip.config.yaml; up/dev call Require only.
package kit

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	EnvFile         = ".env"
	ConfigFile      = "eip.config.yaml"
	AppStackFile    = "docker-stack.yml"
	AppStackDevFile = "docker-stack.dev.yml"
	DataStackFile   = "docker-stack.data.yml"
	ObsStackFile    = "docker-stack.obs.yml"
)

// Require fails if any required kit file is missing under home.
// forDev also requires docker-stack.dev.yml.
func Require(home string, forDev bool) error {
	files := []string{EnvFile, ConfigFile, AppStackFile, DataStackFile}
	if forDev {
		files = append(files, AppStackDevFile)
	}
	var missing []string
	for _, f := range files {
		p := filepath.Join(home, f)
		st, err := os.Stat(p)
		if err != nil || st.IsDir() {
			missing = append(missing, f)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	return fmt.Errorf("missing kit files (%s); run eip init", strings.Join(missing, ", "))
}
