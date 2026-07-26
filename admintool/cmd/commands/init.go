package commands

import (
	"context"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/dataplane/mongo"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
)

func init() {
	if v, ok := catalog.ByID("init"); ok {
		initCmd.Short = v.Short
	}
	rootCmd.AddCommand(initCmd)
}

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Write missing .env / eip.config.yaml from bundled templates",
	Long: `Write missing .env and eip.config.yaml from templates embedded in this binary.
Does not overwrite existing files. If the mongo Swarm task is running, also runs mongo.Ensure.`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		msg.EmitStackForVerb("init")
		home, err := kit.Home()
		if err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}

		wroteEnv, err := kit.WriteMissingEnv(home)
		if err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}
		wroteCfg, err := kit.WriteMissingConfig(home)
		if err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}

		for _, line := range initLines(home, wroteEnv, wroteCfg) {
			msg.Line(line)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		running, err := mongo.TaskRunning(ctx, "")
		if err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}
		if !running {
			msg.Line("mongo task not running — skip Ensure (run eip up or start data stack)")
		} else if err := mongo.Ensure(ctx, ""); err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}

		chip := "already initialized"
		if wroteEnv || wroteCfg {
			chip = "templates written"
		}
		msg.EmitStack("init", msg.LightGreen, chip)
		return nil
	},
}

func initLines(home string, wroteEnv, wroteCfg bool) []string {
	lines := make([]string, 0, 3)
	if wroteEnv {
		lines = append(lines, "wrote "+kit.EnvFile+" from bundled template")
	} else {
		lines = append(lines, kit.EnvFile+" already present (unchanged)")
	}
	if wroteCfg {
		lines = append(lines, "wrote "+kit.ConfigFile+" from bundled template")
	} else {
		lines = append(lines, kit.ConfigFile+" already present (unchanged)")
	}
	return append(lines, "home: "+home)
}
