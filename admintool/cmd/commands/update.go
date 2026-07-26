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
)

func init() {
	if v, ok := catalog.ByID("update"); ok {
		updateCmd.Short = v.Short
	}
	updateCmd.Flags().Bool("dry-run", false, "resolve latest release only; do not download or replace")
	rootCmd.AddCommand(updateCmd)
}

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update eip binary (bundled configs/templates/bake ship with it)",
	Long: `Download the latest eip binary for this OS/arch from GitHub Releases and
replace the on-disk executable (rename dance; safe on Windows).

Does not rematerialize stacks. After updating, restart this process, then run
eip sync to apply bundled observability config changes.`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		msg.EmitStackForVerb("update")

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		msg.Step("Checking GitHub Releases for eip…")
		res, err := kit.SelfUpdate(ctx, kit.Options{
			CurrentVersion: Version,
			DryRun:         dryRun,
		})
		if err != nil {
			msg.EmitStack("update", msg.LightRed, err.Error())
			return err
		}

		for _, line := range strings.Split(formatUpdateResult(res), "\n") {
			msg.Line(line)
		}
		msg.EmitStack("update", msg.LightGreen, shortUpdateChip(res))
		return nil
	},
}

func formatUpdateResult(res kit.Result) string {
	if res.Skipped {
		return fmt.Sprintf("already up to date (%s)", res.Current)
	}
	if res.DryRun {
		return fmt.Sprintf("dry-run: would update %s → %s\n  asset %s\n  %s", res.Current, res.Latest, res.Asset, res.URL)
	}
	return fmt.Sprintf(
		"updated eip %s → %s\nrestart this process to run the new binary\nrun eip sync to apply bundled observability configs",
		res.Current, res.Latest,
	)
}

func shortUpdateChip(res kit.Result) string {
	if res.Skipped {
		return "up to date"
	}
	if res.DryRun {
		return "dry-run " + res.Latest
	}
	return "updated " + res.Latest
}
