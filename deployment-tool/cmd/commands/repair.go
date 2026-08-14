package commands

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/deployment-tool/internal/catalog"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/ops"
	"eve-industry-planner/deployment-tool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("repair"); ok {
		repairCmd.Short = v.Short
	}
	repairCmd.Flags().BoolP("dry-run", "n", false, "print heal plan only; do not mutate")
	rootCmd.AddCommand(repairCmd)
}

var repairCmd = &cobra.Command{
	Use:   "repair",
	Short: "Heal unhealthy stack services",
	Long: `Heal an already-deployed but unhealthy Swarm stack.

  eip repair
  eip repair --dry-run

Refuses when Swarm is inactive / nothing is deployed (use eip up) or when the
stack looks healthy (use eip update).

Steps:
  • rematerialize once if expected services are missing (live, or dev if stack is pure dev)
  • wait briefly for rematerialized ensure-targets, then run ServiceEnsures for bad shorts (skip if still no task)
  • force-update bad services that were already present (same images; no pull/bake)

Does not run dataplane.Ready, engine cold start, binary/stack kit update, or image pull.

TUI shows Repair when the Health chip is amber/red (Start when nothing is deployed; Update when healthy).`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		msg.EmitStackForVerb("repair")

		ctx, cancel := process.TimeoutSignalContext(45 * time.Minute)
		defer cancel()

		if err := process.MapDoneError(ops.Repair(ctx, ops.RepairOpts{DryRun: dryRun})); err != nil {
			msg.EmitStack("repair", msg.LightRed, err.Error())
			return err
		}
		outMsg := "repair complete"
		if dryRun {
			outMsg = "repair dry-run complete"
		}
		msg.EmitStack("repair", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
