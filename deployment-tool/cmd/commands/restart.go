package commands

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/deployment-tool/internal/catalogue"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/ops"
	"eve-industry-planner/deployment-tool/internal/process"
)

func init() {
	if v, ok := catalogue.ByID("restart"); ok {
		restartCmd.Short = v.Short
	}
	restartCmd.Flags().BoolP("yes", "y", false, "skip confirmation prompt")
	restartCmd.Flags().Bool("list", false, "print running service short names (one per line) and exit")
	rootCmd.AddCommand(restartCmd)
}

var restartCmd = &cobra.Command{
	Use:   "restart [service|all]",
	Short: "Rolling restart (same images; one service or all)",
	Long: `Force-update Swarm service(s) in the stack (same images; no pull/bake).

  eip restart api
  eip restart all -y
  eip restart --list

Membership is com.docker.stack.namespace (Engine SDK).
The TUI uses --list to populate a service picker, then runs restart <target> -y.`,
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

		yes, _ := cmd.Flags().GetBool("yes")
		msg.EmitStackForVerb("restart")

		ctx, cancel := process.TimeoutSignalContext(15 * time.Minute)
		defer cancel()

		target := ""
		if len(args) > 0 {
			target = args[0]
		}
		if err := process.MapDoneError(ops.Restart(ctx, target, yes)); err != nil {
			msg.EmitStack("restart", msg.LightRed, err.Error())
			return err
		}
		outMsg := "restart complete"
		msg.EmitStack("restart", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
