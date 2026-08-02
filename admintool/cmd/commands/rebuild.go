package commands

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/deploy"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("rebuild"); ok {
		rebuildCmd.Short = v.Short
	}
	rebuildCmd.Flags().Bool("no-cache", false, "bake without Docker layer cache")
	rootCmd.AddCommand(rebuildCmd)
}

var rebuildCmd = &cobra.Command{
	Use:   "rebuild",
	Short: "Bake local images and rematerialize (roll only when digests change)",
	Long: `Bake Swarm app images (docker-stack.dev.yml), promote TAG_* only when a
role's digest changes, then rematerialize the stack. Unchanged image specs
are left alone so Swarm does not roll those services.

Requires a prior eip dev stack (dev source). Does not re-run engine/dataplane Ready.`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		noCache, _ := cmd.Flags().GetBool("no-cache")
		msg.EmitStackForVerb("rebuild")

		ctx, cancel := process.TimeoutSignalContext(45 * time.Minute)
		defer cancel()

		var bakeArgs []string
		if noCache {
			bakeArgs = append(bakeArgs, "--no-cache")
		}

		if err := process.MapDoneError(deploy.Rebuild(ctx, bakeArgs...)); err != nil {
			msg.EmitStack("rebuild", msg.LightRed, err.Error())
			return err
		}
		outMsg := "rebuild complete"
		msg.EmitStack("rebuild", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
