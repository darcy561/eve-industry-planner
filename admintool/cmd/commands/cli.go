package commands

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/ops"
	"eve-industry-planner/admintool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("cli"); ok {
		cliCmd.Short = v.Short
	}
	rootCmd.AddCommand(cliCmd)
}

var cliCmd = &cobra.Command{
	Use:   "cli [tasks-args...]",
	Short: "Run core tasks or open a shell on the running core task",
	Long: `Attach to the post-handoff Swarm core task (eip_core).

One-shots go through the container tasks wrapper (you do not type "tasks"):

  eip cli list
  eip cli sdeVersion
  eip cli -- list

Interactive shell (terminal only; not under TUI):

  eip cli
  eip cli shell

Mid-roll: waits until Swarm leaves a single new core owner (fail on pause /
rollback / timeout). Overrides: EIP_CORE_CONTAINER, EIP_CORE_SERVICE,
EIP_CLI_WAIT_SEC, EIP_CLI_POLL_SEC, EIP_CLI_SHELL.

TUI: More → Command (or :) runs one-shots — type cli list / bare list (shell is terminal-only).`,
	DisableFlagsInUseLine: true,
	Args:                  cobra.ArbitraryArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 && args[0] == "--" {
			args = args[1:]
		}
		shell := len(args) == 0 || (len(args) == 1 && args[0] == "shell")
		msg.EmitStackForVerb("cli")

		timeout := cliContextTimeout(shell)
		ctx, cancel := process.TimeoutSignalContext(timeout)
		defer cancel()

		err := process.MapDoneError(ops.CLI(ctx, ops.CLIOpts{Args: args}))
		if err != nil {
			msg.EmitStack("cli", msg.LightRed, err.Error())
			return err
		}
		if !shell {
			msg.EmitStack("cli", msg.LightGreen, "cli complete")
		}
		return nil
	},
}

func cliContextTimeout(shell bool) time.Duration {
	if shell {
		return 24 * time.Hour
	}
	waitSec := 180
	if v := strings.TrimSpace(os.Getenv("EIP_CLI_WAIT_SEC")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			waitSec = n
		}
	}
	return time.Duration(waitSec)*time.Second + 2*time.Minute
}
