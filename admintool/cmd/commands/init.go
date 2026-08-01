package commands

import (
	"context"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/dataplane"
	"eve-industry-planner/admintool/internal/dataplane/mongo"
	"eve-industry-planner/admintool/internal/dataplane/s3"
	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/kit/templates"
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
	Short: "Write missing .env / eip.config.yaml from Go defaults",
	Long: `Write missing .env (EnvFields with Autogen secrets resolved) and eip.config.yaml
(yamldefaults). Does not overwrite existing files. EVE SSO keys are left blank —
set them (Setup / Edit / hand-edit) before CheckOperatorDocs / ensure can pass.

If Swarm data tasks are running, also runs dataplane.EnsureS3 and/or
dataplane.EnsureMongo as applicable (after the operator-docs gate).

Does not push secrets/config into an existing stack — day-2 apply is eip secrets
then eip sync (TUI Persist queues those child CLIs when Health is up).

TUI Setup is the guided editor for the same files (may overwrite with backups).`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		msg.EmitStackForVerb("init")
		home, err := kit.Home()
		if err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}

		wroteEnv, err := templates.WriteMissingEnv(home)
		if err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}
		wroteCfg, err := templates.WriteMissingConfig(home)
		if err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}

		for _, line := range initLines(home, wroteEnv, wroteCfg) {
			msg.Line(line)
		}

		msg.Step("Checking .env and eip.config.yaml…")
		if err := templates.CheckOperatorDocs(home); err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}
		msg.Line("operator docs ok")

		stackName := docker.ResolveStackName()
		probeCtx, probeCancel := context.WithTimeout(context.Background(), 30*time.Second)
		s3Up, err := s3.TaskRunning(probeCtx, stackName)
		if err != nil {
			probeCancel()
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}
		mongoUp, err := mongo.TaskRunning(probeCtx, stackName)
		probeCancel()
		if err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}
		// Docs already checked above; use Ensure* which re-checks (cheap) before service work.
		if !s3Up {
			msg.Line("seaweedfs task not running — skip EnsureS3 (run eip up or start data stack)")
		} else if err := dataplane.EnsureS3(context.Background(), stackName); err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}
		if !mongoUp {
			msg.Line("mongo task not running — skip EnsureMongo (run eip up or start data stack)")
		} else if err := dataplane.EnsureMongo(context.Background(), stackName); err != nil {
			msg.EmitStack("init", msg.LightRed, err.Error())
			return err
		}

		chip := "already initialized"
		if wroteEnv || wroteCfg {
			chip = "defaults written"
		}
		msg.EmitStack("init", msg.LightGreen, chip)
		return nil
	},
}

func initLines(home string, wroteEnv, wroteCfg bool) []string {
	lines := make([]string, 0, 3)
	if wroteEnv {
		lines = append(lines, "wrote "+kit.EnvFile+" from EnvFields (Autogen secrets generated)")
	} else {
		lines = append(lines, kit.EnvFile+" already present (unchanged)")
	}
	if wroteCfg {
		lines = append(lines, "wrote "+kit.ConfigFile+" from yamldefaults.DefaultConfig")
	} else {
		lines = append(lines, kit.ConfigFile+" already present (unchanged)")
	}
	return append(lines, "home: "+home)
}
