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
	if v, ok := catalog.ByID("restore-mongo-keyfile"); ok {
		restoreMongoKeyfileCmd.Short = v.Short
	}
	rootCmd.AddCommand(restoreMongoKeyfileCmd)
}

var restoreMongoKeyfileCmd = &cobra.Command{
	Use:   "restore-mongo-keyfile",
	Short: "Restore ./mongo-keyfile from a running mongo task",
	Long: `Copy the live keyfile out of the running Swarm mongo task into project-home
./mongo-keyfile and refresh ./mongo-keyfile.bak.

Prefers /tmp/mongo-keyfile (what mongod --keyFile uses after the auth-first CMD
copy) over the /etc bind mount, which may already be a wrongly regenerated host
file. Does not generate a new key, touch volumes, or run Ensure.`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		msg.EmitStackForVerb("restore-mongo-keyfile")

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := mongo.RestoreKeyfileFromContainer(ctx, ""); err != nil {
			msg.EmitStack("restore-mongo-keyfile", msg.LightRed, err.Error())
			return err
		}
		outMsg := "mongo keyfile restored from container"
		msg.EmitStack("restore-mongo-keyfile", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
