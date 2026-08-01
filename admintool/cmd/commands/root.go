// Package commands holds admintool Cobra commands (one file per command).
//
// Convention: one file per verb; init() registers on rootCmd.
// Scaffold: cd admintool/cmd/commands && go run github.com/spf13/cobra-cli@v1.3.0 add <name>
package commands

import (
	"bytes"
	"fmt"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
)

// Version is the tool version (EIP_CLI_VERSION). Set at link time:
//
//	-X eve-industry-planner/admintool/cmd/commands.Version=<version>
var Version = "0.0.0-dev"

func rootLong() string {
	bin := "./eip"
	if runtime.GOOS == "windows" {
		bin = `.\eip.exe`
	}
	return fmt.Sprintf(`Eve Industry Planner - eip

Same binary: interactive / no args → TUI; verbs → CLI.
Source lives in admintool/; command prefix is eip.

  %s              # TUI (run from a terminal)
  %s ui           # force TUI
  %s doctor       # CLI Docker / stack health check
  %s --version
  %s help`, bin, bin, bin, bin, bin)
}

// rootCmd is the base command when called without subcommands.
var rootCmd = &cobra.Command{
	Use:           "eip",
	Short:         "Eve Industry Planner deployment management",
	Long:          rootLong(),
	SilenceUsage:  true,
	SilenceErrors: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

// Execute adds child commands to the root and sets flags appropriately.
func Execute() error {
	return rootCmd.Execute()
}

// RunArgs executes the CLI with the given argv (no program name) and captures
// combined stdout/stderr for the TUI. Safe for sequential use from one process.
func RunArgs(args []string) (output string, err error) {
	var out, errOut bytes.Buffer
	rootCmd.SetArgs(args)
	rootCmd.SetOut(&out)
	rootCmd.SetErr(&errOut)
	err = rootCmd.Execute()
	var b strings.Builder
	b.Write(out.Bytes())
	if errOut.Len() > 0 {
		if out.Len() > 0 {
			b.WriteByte('\n')
		}
		b.Write(errOut.Bytes())
	}
	if err != nil {
		msg := err.Error()
		if b.Len() > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(msg)
	}
	return b.String(), err
}

func init() {
	rootCmd.CompletionOptions.DisableDefaultCmd = true
	rootCmd.Version = Version
	rootCmd.SetVersionTemplate("{{.Version}}\n")
}
