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
	if v, ok := catalogue.ByID("shutdown"); ok {
		shutdownCmd.Short = v.Short
	}
	shutdownCmd.Flags().BoolP("yes", "y", false, "skip confirmation prompt")
	rootCmd.AddCommand(shutdownCmd)
}

var shutdownCmd = &cobra.Command{
	Use:   "shutdown",
	Short: "Stop the app completely (keeps volumes / data)",
	Long: `Remove all Swarm services (and stack networks) labelled
com.docker.stack.namespace=eip, then tear down leftover Compose project
resources. Volumes and external networks (eip-core) are kept.

  eip shutdown -y`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		yes, _ := cmd.Flags().GetBool("yes")
		msg.EmitStackForVerb("shutdown")

		ctx, cancel := process.TimeoutSignalContext(10 * time.Minute)
		defer cancel()

		if err := process.MapDoneError(ops.Shutdown(ctx, yes)); err != nil {
			msg.EmitStack("shutdown", msg.LightRed, err.Error())
			return err
		}
		outMsg := "shutdown complete"
		msg.EmitStack("shutdown", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
