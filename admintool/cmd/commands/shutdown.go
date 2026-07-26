package commands

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/ops"
)

func init() {
	if v, ok := catalog.ByID("shutdown"); ok {
		shutdownCmd.Short = v.Short
	}
	shutdownCmd.Flags().BoolP("yes", "y", false, "skip confirmation prompt")
	rootCmd.AddCommand(shutdownCmd)
}

var shutdownCmd = &cobra.Command{
	Use:   "shutdown",
	Short: "Stop the app completely (keeps volumes / data)",
	Long: `Remove all Swarm services (and stack networks) labeled
com.docker.stack.namespace=eip, then tear down leftover Compose project
resources. Volumes and external networks (eip-core) are kept.

  eip shutdown -y`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		yes, _ := cmd.Flags().GetBool("yes")
		msg.EmitStackForVerb("shutdown")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		if err := ops.Shutdown(ctx, yes); err != nil {
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
