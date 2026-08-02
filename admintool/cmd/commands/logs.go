package commands

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/ops"
	"eve-industry-planner/admintool/internal/process"
	"eve-industry-planner/admintool/tui/screens/logview"
)

func init() {
	if v, ok := catalog.ByID("logs"); ok {
		logsCmd.Short = v.Short
	}
	logsCmd.Flags().BoolP("follow", "f", false, "follow log output (one service only)")
	logsCmd.Flags().String("tail", "100", "number of lines to show from the end")
	logsCmd.Flags().Bool("list", false, "print running service short names (one per line) and exit")
	logsCmd.Flags().Bool("ui", false, "follow in a thin logview window (title + scrolling body)")
	rootCmd.AddCommand(logsCmd)
}

var logsCmd = &cobra.Command{
	Use:   "logs [service|all]",
	Short: "Show Swarm service logs",
	Long: `Show logs for a Swarm stack service (Engine SDK).

  eip logs api
  eip logs api -f
  eip logs api -f --ui
  eip logs all
  eip logs --list

Default --tail=100. Follow (-f) is one service only (not all).
--ui opens a resizable follow window (mini logo + service name + scrollable logs).
TUI: dump → OUTPUT pane; follow → new console with --ui.`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		listOnly, _ := cmd.Flags().GetBool("list")
		if listOnly {
			ctx, cancel := process.TimeoutSignalContext(30 * time.Second)
			defer cancel()
			names, err := ops.ListRunning(ctx)
			if err != nil {
				return process.MapDoneError(err)
			}
			for _, n := range names {
				fmt.Fprintln(cmd.OutOrStdout(), n)
			}
			return nil
		}

		follow, _ := cmd.Flags().GetBool("follow")
		useUI, _ := cmd.Flags().GetBool("ui")
		tail, _ := cmd.Flags().GetString("tail")
		target := ""
		if len(args) > 0 {
			target = args[0]
		}

		if useUI {
			if !follow {
				return fmt.Errorf("logs: --ui requires -f (follow)")
			}
			msg.EmitStackForVerb("logs")
			if err := logview.Run(target, tail); err != nil {
				msg.EmitStack("logs", msg.LightRed, err.Error())
				return err
			}
			return nil
		}

		msg.EmitStackForVerb("logs")

		timeout := 2 * time.Minute
		if follow {
			timeout = 24 * time.Hour
		}
		ctx, cancel := process.TimeoutSignalContext(timeout)
		defer cancel()

		err := process.MapDoneError(ops.Logs(ctx, ops.LogsOpts{
			Target: target,
			Tail:   tail,
			Follow: follow,
		}))
		if err != nil {
			msg.EmitStack("logs", msg.LightRed, err.Error())
			return err
		}
		if follow {
			return nil
		}
		outMsg := "logs complete"
		msg.EmitStack("logs", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
