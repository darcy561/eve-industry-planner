package commands

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/dataplane/mongo"
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
	Short: "Ensure mongo RS, users, and change-stream preimages",
	Long: `Idempotent mongo ensure (replica set, root + app users, preimage collections).

Requires a running Swarm mongo task and MONGO_* in .env.
Keyfile: keep ./mongo-keyfile; refreshes ./mongo-keyfile.bak; restores from .bak if primary is missing;
generates only when no mongo data volume exists. If the host key is lost but the task is still up,
use eip restore-mongo-keyfile. Does not deploy stacks, bake, or check S3.`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		msg.EmitStackForVerb("ensure-mongo")

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		if err := mongo.Ensure(ctx, ""); err != nil {
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
