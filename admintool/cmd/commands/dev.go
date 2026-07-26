package commands

import (
	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/deploy"
)

func init() {
	if v, ok := catalog.ByID("dev"); ok {
		devCmd.Short = v.Short
	}
	rootCmd.AddCommand(devCmd)
}

var devCmd = &cobra.Command{
	Use:   "dev",
	Short: "Bring up Swarm stack with local bake images",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runDeploy(cmd, deploy.SourceDev)
	},
}
