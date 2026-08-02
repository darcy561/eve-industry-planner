// Package kit is project-home layout: filenames, Home/Path, Require, envfile helpers,
// and product strings. Document templates → kit/templates/{env,yamldefaults}.
// Live eip.config.yaml load/apply → internal/config. Observability embeds stay in kit (obs/).
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
