package commands

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/dataplane"
	"eve-industry-planner/admintool/internal/msg"
)

func init() {
	if v, ok := catalog.ByID("ensure-s3"); ok {
		ensureS3Cmd.Short = v.Short
	}
	rootCmd.AddCommand(ensureS3Cmd)
}

var ensureS3Cmd = &cobra.Command{
	Use:   "ensure-s3",
	Short: "Ensure SeaweedFS app buckets static-data / static-data-test (CLI)",
	Long: `Idempotent S3 ensure via dataplane.EnsureS3 (wait for seaweedfs, create app buckets).

Requires a running Swarm seaweedfs task and S3_ACCESS_KEY / S3_SECRET_KEY in .env.
Does not deploy stacks, bake, or run mongo ensure.

Same path as dataplane.Ready's S3 half (eip up / eip dev).`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		msg.EmitStackForVerb("ensure-s3")

		if err := dataplane.EnsureS3(context.Background(), ""); err != nil {
			msg.EmitStack("ensure-s3", msg.LightRed, err.Error())
			return err
		}
		outMsg := "s3 ensure complete"
		msg.EmitStack("ensure-s3", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
