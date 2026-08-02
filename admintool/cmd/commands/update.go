package commands

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"eve-industry-planner/admintool/internal/catalog"
	"eve-industry-planner/admintool/internal/config"
	"eve-industry-planner/admintool/internal/deploy"
	"eve-industry-planner/admintool/internal/images"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
)

func init() {
	if v, ok := catalog.ByID("update"); ok {
		updateCmd.Short = v.Short
	}
	updateCmd.Flags().Bool("dry-run", false, "resolve changes only; do not download or write")
	updateCmd.Flags().Bool("binary-only", false, "update host eip binary only")
	updateCmd.Flags().Bool("stacks-only", false, "update docker-stack*.yml only")
	updateCmd.Flags().Bool("images-only", false, "pull live images and reconcile digests only")
	rootCmd.AddCommand(updateCmd)
}

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update binary, stack YAML, and/or live images",
	Long: `Day-2 refresh: host eip binary (GitHub Releases), docker-stack*.yml from the
baked kit git branch, then pull live images and force-update services whose
running digest drifted.

Default order: binary → stacks → images.
  --binary-only   only the host binary
  --stacks-only   only stack YAML
  --images-only   only pull + digest reconcile

After a binary install: TUI relaunches then resumes update; CLI re-execs
eip update so stacks/images run under the new binary. A second binary check
is a no-op when already current.

Does not overwrite .env. Not a full cold start (use eip up).`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		binaryOnly, _ := cmd.Flags().GetBool("binary-only")
		stacksOnly, _ := cmd.Flags().GetBool("stacks-only")
		imagesOnly, _ := cmd.Flags().GetBool("images-only")
		nOnly := 0
		if binaryOnly {
			nOnly++
		}
		if stacksOnly {
			nOnly++
		}
		if imagesOnly {
			nOnly++
		}
		if nOnly > 1 {
			return fmt.Errorf("use only one of --binary-only, --stacks-only, or --images-only")
		}
		doBinary := !stacksOnly && !imagesOnly
		doStacks := !binaryOnly && !imagesOnly
		doImages := !binaryOnly && !stacksOnly

		msg.EmitStackForVerb("update")

		ctx, cancel := process.TimeoutSignalContext(45 * time.Minute)
		defer cancel()

		var binRes kit.Result
		var stackRes kit.StackUpdateResult
		var err error

		if doBinary {
			msg.Step("Checking GitHub Releases for eip…")
			binRes, err = kit.SelfUpdate(ctx, kit.Options{
				CurrentVersion: Version,
				DryRun:         dryRun,
			})
			if err != nil {
				err = process.MapDoneError(err)
				msg.EmitStack("update", msg.LightRed, err.Error())
				return err
			}
			for line := range strings.SplitSeq(formatBinaryUpdateResult(binRes), "\n") {
				msg.Line(line)
			}

			if binRes.Installed && !dryRun {
				if process.FromTUI() {
					if binaryOnly {
						msg.EmitStack("update", msg.LightGreen, shortUpdateChip(false, true, false, stackRes, binRes, dryRun))
					} else {
						msg.EmitStack("update", msg.LightGreen, "binary updated; restarting TUI")
					}
					msg.EmitStack("update", msg.LightGreen, binaryInstallTUIRestartMessage(binaryOnly))
					return nil
				}
				if !binaryOnly {
					msg.Step("Re-running update with new binary…")
					return kit.RunSelf(updateContinueArgs(dryRun, stacksOnly, imagesOnly))
				}
			}
		}

		if doStacks {
			msg.Step("Checking stack YAML…")
			stackRes, err = kit.UpdateStacks(ctx, kit.StackUpdateOptions{DryRun: dryRun})
			if err != nil {
				err = process.MapDoneError(err)
				msg.EmitStack("update", msg.LightRed, err.Error())
				return err
			}
			for line := range strings.SplitSeq(formatStackUpdateResult(stackRes), "\n") {
				msg.Line(line)
			}
		}

		if doImages && !dryRun {
			if err := process.MapDoneError(runImageUpdate(ctx, len(stackRes.Updated) > 0)); err != nil {
				msg.EmitStack("update", msg.LightRed, err.Error())
				return err
			}
		} else if doImages && dryRun {
			msg.Step("images dry-run: would pull live images and reconcile digests")
		}

		msg.EmitStack("update", msg.LightGreen, shortUpdateChip(doStacks, doBinary, doImages, stackRes, binRes, dryRun))
		return nil
	},
}

func updateContinueArgs(dryRun, stacksOnly, imagesOnly bool) []string {
	args := []string{"update"}
	if dryRun {
		args = append(args, "--dry-run")
	}
	if stacksOnly {
		args = append(args, "--stacks-only")
	}
	if imagesOnly {
		args = append(args, "--images-only")
	}
	return args
}

// binaryInstallTUIRestartMessage is the chip the TUI watches after a binary install.
// Full update → restart-resume (relaunch then continue stacks/images).
// --binary-only → restart (relaunch only).
func binaryInstallTUIRestartMessage(binaryOnly bool) string {
	if binaryOnly {
		return "restart"
	}
	return "restart-resume"
}

func runImageUpdate(ctx context.Context, stacksChanged bool) error {
	home, err := kit.Home()
	if err != nil {
		return err
	}
	cfg, err := config.LoadYAML(filepath.Join(home, kit.ConfigFile))
	if err != nil {
		return fmt.Errorf("eip.config.yaml: %w", err)
	}
	wantObs := cfg.Addons.Observability.Enabled

	if err := images.PullLive(ctx, home, wantObs); err != nil {
		return err
	}
	if stacksChanged {
		msg.Step("Rematerializing stack after YAML change…")
		if err := deploy.Rematerialize(ctx, deploy.SourceLive); err != nil {
			return err
		}
	}
	return images.ReconcileLive(ctx, home, wantObs)
}

func formatStackUpdateResult(res kit.StackUpdateResult) string {
	var b strings.Builder
	fmt.Fprintf(&b, "stacks branch: %s", res.Branch)
	if len(res.Updated) == 0 && len(res.Unchanged) > 0 {
		fmt.Fprintf(&b, "\n  unchanged: %s", strings.Join(res.Unchanged, ", "))
		return b.String()
	}
	if len(res.Updated) > 0 {
		verb := "updated"
		if res.DryRun {
			verb = "would update"
		}
		fmt.Fprintf(&b, "\n  %s: %s", verb, strings.Join(res.Updated, ", "))
	}
	if len(res.Unchanged) > 0 {
		fmt.Fprintf(&b, "\n  unchanged: %s", strings.Join(res.Unchanged, ", "))
	}
	return b.String()
}

func formatBinaryUpdateResult(res kit.Result) string {
	if res.Skipped {
		return fmt.Sprintf("binary: already up to date (%s)", res.Current)
	}
	if res.DryRun {
		return fmt.Sprintf("binary dry-run: would update %s → %s\n  asset %s\n  %s", res.Current, res.Latest, res.Asset, res.URL)
	}
	if process.FromTUI() {
		return fmt.Sprintf("binary: updated %s → %s\nTUI will restart with the new binary", res.Current, res.Latest)
	}
	return fmt.Sprintf(
		"binary: updated %s → %s\ncontinuing update with the new binary",
		res.Current, res.Latest,
	)
}

func shortUpdateChip(doStacks, doBinary, doImages bool, stacks kit.StackUpdateResult, bin kit.Result, dryRun bool) string {
	parts := []string{}
	if doBinary {
		if bin.Skipped {
			parts = append(parts, "binary ok")
		} else if dryRun {
			parts = append(parts, "binary dry-run")
		} else if bin.Installed {
			parts = append(parts, "binary updated")
		}
	}
	if doStacks {
		if len(stacks.Updated) == 0 {
			parts = append(parts, "stacks ok")
		} else if dryRun {
			parts = append(parts, "stacks dry-run")
		} else {
			parts = append(parts, "stacks updated")
		}
	}
	if doImages {
		if dryRun {
			parts = append(parts, "images dry-run")
		} else {
			parts = append(parts, "images ok")
		}
	}
	return strings.Join(parts, "; ")
}
