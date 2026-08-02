package commands

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/dataplane/mongo"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("rekey-mongo"); ok {
		rekeyMongoCmd.Short = v.Short
	}
	rekeyMongoCmd.Flags().BoolP("yes", "y", false, "skip confirmation prompt")
	rootCmd.AddCommand(rekeyMongoCmd)
}

var rekeyMongoCmd = &cobra.Command{
	Use:   "rekey-mongo",
	Short: "Rekey ./mongo-keyfile using MONGO_ROOT_* against a down stack volume",
	Long: `Recover a lost host keyfile when the Swarm stack is already down.

Stack must already be down. Starts a temporary auth-first mongod against the
data volume with a candidate keyFile, verifies MONGO_ROOT_* from .env, then
promotes that candidate to ./mongo-keyfile + .bak.

Does not scale Swarm, deploy, dump/wipe, or run Ensure.

  eip rekey-mongo -y`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		yes, _ := cmd.Flags().GetBool("yes")
		msg.EmitStackForVerb("rekey-mongo")

		if !process.Confirm("Replace ./mongo-keyfile (+ .bak) after verifying MONGO_ROOT_* on the data volume. Stack must be down.", yes) {
			return fmt.Errorf("cancelled")
		}

		ctx, cancel := process.TimeoutSignalContext(3 * time.Minute)
		defer cancel()

		if err := process.MapDoneError(mongo.Rekey(ctx, "")); err != nil {
			msg.EmitStack("rekey-mongo", msg.LightRed, err.Error())
			return err
		}
		outMsg := "mongo rekey complete — bring stack up, then eip ensure-mongo if needed"
		msg.EmitStack("rekey-mongo", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}
