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
	if v, ok := catalog.ByID("ensure-mongo"); ok {
		ensureMongoCmd.Short = v.Short
	}
	rootCmd.AddCommand(ensureMongoCmd)
}

var ensureMongoCmd = &cobra.Command{
	Use:   "ensure-mongo",
	Short: "Ensure mongo RS, users, preimages, and indexes",
	Long: `Idempotent mongo ensure via dataplane.EnsureMongo (replica set, root + app users,
preimage collections, application indexes).

Requires a running Swarm mongo task and MONGO_* in .env.
Keyfile: keep ./mongo-keyfile; refreshes ./mongo-keyfile.bak; restores from .bak if primary is missing;
generates only when no mongo data volume exists. If the host key is lost but the task is still up,
use eip restore-mongo-keyfile. Does not deploy stacks, bake, or run S3 ensure.

No short timeout — waits for index builds; cancel with Ctrl+C / process interrupt.
Same path as dataplane.Ready's mongo half (eip up / eip dev).`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		msg.EmitStackForVerb("ensure-mongo")

		// No short timeout — match Ready / EnsureMongo (index builds may be long).
		if err := dataplane.EnsureMongo(context.Background(), ""); err != nil {
			msg.EmitStack("ensure-mongo", msg.LightRed, err.Error())
			return err
		}
		outMsg := "mongo ensure complete"
		msg.EmitStack("ensure-mongo", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
