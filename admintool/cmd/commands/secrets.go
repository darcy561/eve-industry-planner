package commands

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/deploy"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/swarm"
)

func init() {
	if v, ok := catalog.ByID("secrets"); ok {
		secretsCmd.Short = v.Short
	}
	secretsCmd.Flags().BoolP("dry-run", "n", false, "print planned secrets rematerialize without applying")
	secretsCmd.Flags().Bool("live", false, "rematerialize with live image expand (default)")
	secretsCmd.Flags().Bool("dev", false, "rematerialize with local bake TAG_* from running services")
	rootCmd.AddCommand(secretsCmd)
}

var secretsCmd = &cobra.Command{
	Use:   "secrets",
	Short: "Sync .env secrets to Swarm and rematerialize mounts",
	Long: `Sync curated .env secrets to hashed Swarm secret objects, then rematerialize
the stack so services remount /run/secrets.

Default --live (eip up). Use --dev when the stack was brought up with eip dev
so expand keeps local bake TAG_* from running services.`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		wantDev, _ := cmd.Flags().GetBool("dev")
		wantLive, _ := cmd.Flags().GetBool("live")
		if wantDev && wantLive {
			return fmt.Errorf("secrets: use only one of --live or --dev")
		}
		src := deploy.SourceLive
		if wantDev {
			src = deploy.SourceDev
		}

		msg.EmitStackForVerb("secrets")

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()

		if dryRun {
			if err := secretsDryRun(src); err != nil {
				msg.EmitStack("secrets", msg.LightRed, err.Error())
				return err
			}
			outMsg := "secrets dry-run complete"
			msg.EmitStack("secrets", msg.LightGreen, outMsg)
			if !msg.Enabled() {
				fmt.Fprintln(cmd.OutOrStdout(), outMsg)
			}
			return nil
		}

		if err := deploy.Rematerialize(ctx, src); err != nil {
			msg.EmitStack("secrets", msg.LightRed, err.Error())
			return err
		}
		outMsg := "secrets complete"
		msg.EmitStack("secrets", msg.LightGreen, outMsg)
		if !msg.Enabled() {
			fmt.Fprintln(cmd.OutOrStdout(), outMsg)
		}
		return nil
	},
}

func secretsDryRun(src deploy.Source) error {
	home, err := kit.Home()
	if err != nil {
		return err
	}
	if err := kit.Require(home, src == deploy.SourceDev); err != nil {
		return err
	}
	msg.Step("Dry-run: would sync Swarm secrets from %s…", kit.EnvFile)
	if err := swarm.ValidateEnv(home); err != nil {
		return err
	}
	attach, err := swarm.DiscoverAttach(filepath.Join(home, kit.AppStackFile))
	if err != nil {
		return err
	}
	msg.Line(fmt.Sprintf("  attach targets: %d (from %s)", len(attach), kit.AppStackFile))
	msg.Line(fmt.Sprintf("dry-run: would rematerialize stack (source=%s) then prune stale secrets", src))
	return nil
}
