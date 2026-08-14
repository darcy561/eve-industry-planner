package commands

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/deployment-tool/internal/catalog"
	"eve-industry-planner/deployment-tool/internal/deploy"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("up"); ok {
		upCmd.Short = v.Short
	}
	rootCmd.AddCommand(upCmd)
}

var upCmd = &cobra.Command{
	Use:   "up",
	Short: "Bring up Swarm stack (live images)",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runDeploy(cmd, deploy.SourceLive)
	},
}

func runDeploy(cmd *cobra.Command, src deploy.Source) error {
	verb := "up"
	if src == deploy.SourceDev {
		verb = "dev"
	}
	msg.EmitStackForVerb(verb)

	ctx, cancel := process.TimeoutSignalContext(45 * time.Minute)
	defer cancel()

	err := process.MapDoneError(deploy.Run(ctx, src))
	if err != nil {
		msg.EmitStack(verb, msg.LightRed, err.Error())
		return err
	}
	outMsg := fmt.Sprintf("%s complete", verb)
	msg.EmitStack(verb, msg.LightGreen, outMsg)
	if !msg.Enabled() {
		fmt.Fprintln(cmd.OutOrStdout(), outMsg)
	}
	return nil
}
