package commands

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("update-binary"); ok {
		updateBinaryCmd.Short = v.Short
	}
	updateBinaryCmd.Flags().Bool("dry-run", false, "resolve latest GitHub release only; do not download or replace")
	rootCmd.AddCommand(updateBinaryCmd)
}

var updateBinaryCmd = &cobra.Command{
	Use:   "update-binary",
	Short: "Update the eip host binary (and assets embedded in it)",
	Long: `Download an eip binary for this OS/arch from GitHub Releases and replace
the on-disk executable (rename dance; safe on Windows).

Default: GitHub /releases/latest (Public). Prerelease / branch channels:
set EIP_UPDATE_TAG=prerelease or EIP_UPDATE_TAG=prerelease-<branch-slug>
(see docs/admintool/PRERELEASE.md). Swarm prereleases are marked prerelease on
GitHub so they never take over /releases/latest.

The binary embeds TUI assets, observability kit, bake HCL, and template defaults.
Replacing it refreshes those. Operator files already on disk (.env, eip.config.yaml,
stack YAML, mongo-keyfile) are not overwritten — use eip sync after restart if
bundled Swarm config bytes changed.

Not a Public first-touch installer (that remains Make update-files / chicken-egg).
Not an app/image ship — use eip up / eip dev / eip rebuild for the stack.`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		msg.EmitStackForVerb("update-binary")

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		msg.Step("Checking GitHub Releases for eip…")
		res, err := kit.SelfUpdate(ctx, kit.Options{
			CurrentVersion: Version,
			DryRun:         dryRun,
		})
		if err != nil {
			msg.EmitStack("update-binary", msg.LightRed, err.Error())
			return err
		}

		for _, line := range strings.Split(formatUpdateBinaryResult(res), "\n") {
			msg.Line(line)
		}
		chip := shortUpdateBinaryChip(res)
		msg.EmitStack("update-binary", msg.LightGreen, chip)
		// TUI parent still runs the old image in memory — ask it to relaunch.
		if res.Installed && process.FromTUI() {
			msg.EmitStack("update-binary", msg.LightGreen, "restart")
		}
		return nil
	},
}

func formatUpdateBinaryResult(res kit.Result) string {
	if res.Skipped {
		return fmt.Sprintf("already up to date (%s)", res.Current)
	}
	if res.DryRun {
		return fmt.Sprintf("dry-run: would update %s → %s\n  asset %s\n  %s", res.Current, res.Latest, res.Asset, res.URL)
	}
	if process.FromTUI() {
		return fmt.Sprintf(
			"updated eip %s → %s\nTUI will restart with the new binary",
			res.Current, res.Latest,
		)
	}
	return fmt.Sprintf(
		"updated eip %s → %s\nnext eip command uses the new binary\nrun eip sync if bundled observability configs changed",
		res.Current, res.Latest,
	)
}

func shortUpdateBinaryChip(res kit.Result) string {
	if res.Skipped {
		return "up to date"
	}
	if res.DryRun {
		return "dry-run " + res.Latest
	}
	return "updated " + res.Latest
}
