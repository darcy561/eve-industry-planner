package commands

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/deployment-tool/internal/catalog"
	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("sync"); ok {
		syncCmd.Short = v.Short
	}
	syncCmd.Flags().BoolP("dry-run", "n", false, "print planned updates without applying")
	rootCmd.AddCommand(syncCmd)
}

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Apply eip.config.yaml (capacity, Traefik, Grafana, file configs)",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		msg.EmitStackForVerb("sync")

		ctx, cancel := process.TimeoutSignalContext(10 * time.Minute)
		defer cancel()

		err := process.MapDoneError(config.Sync(ctx, dryRun))
		if err != nil {
			msg.EmitStack("sync", msg.LightRed, err.Error())
			return err
		}
		outMsg := "sync complete"
		if dryRun {
			outMsg = "sync dry-run complete"
		}
		msg.EmitStack("sync", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
