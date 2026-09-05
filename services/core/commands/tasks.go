package commands

import (
	"context"
	"encoding/json"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"strconv"
	"strings"
	"time"

	clicommands "eve-industry-planner/core/commands/cli"
	eipnats "eve-industry-planner/shared/nats"
)

const usageExamples = `Examples:
  tasks list
  tasks sdeVersion
  tasks sdeVersionHistory
  tasks esiRateLimitGroups
  tasks resetEsiRateLimitGroups
  tasks workerQueues
  tasks purgeWorkerQueues
  tasks unlockSdeVersion
  tasks queueArchivedJobStatsRebuild -all -dry-run
  tasks queueArchivedJobStatsRebuild -account <account_id> -dry-run
  tasks checkSdeUpdates
  tasks applySdeVersion --version=12345
  tasks forceSdeRebuild
  tasks rotateRefreshTokenKeys --from=v1 --scan-batch-size=500
  tasks dispatchStatisticsReconciles`

// taskOptions carries what an operator typed alongside the task name.
type taskOptions struct {
	version    int
	versionSet bool
}

// dispatch is one task an operator may run: what they type, the definition it
// names, and the call that publishes it.
//
// The publish is the task's own helper rather than a subject and a payload built
// here, so a task reaches the operator surface by being listed and cannot be
// published in a shape its handler does not take.
type dispatch struct {
	command string
	task    eipnats.Definition
	publish func(context.Context, *eipnats.NATS, taskOptions) error
}

// dispatchTable is the allowlist. A task absent from it is not runnable from the
// command line, whatever the registry holds.
var dispatchTable = []dispatch{
	{
		command: "checkSdeUpdates",
		task:    eipnats.CheckSDEUpdates,
		publish: func(ctx context.Context, n *eipnats.NATS, _ taskOptions) error {
			return eipnats.TriggerCheckSDEUpdates(ctx, n)
		},
	},
	{
		command: "applySdeVersion",
		task:    eipnats.ApplySDEVersion,
		publish: func(ctx context.Context, n *eipnats.NATS, o taskOptions) error {
			if !o.versionSet {
				return fmt.Errorf("task %q requires --version=<int> (example: tasks applySdeVersion --version=3272045)", "applySdeVersion")
			}
			if o.version <= 0 {
				return fmt.Errorf("task %q requires --version to be a positive integer (> 0), got %d", "applySdeVersion", o.version)
			}
			return eipnats.PublishApplySDEVersion(ctx, n, o.version)
		},
	},
	{
		command: "forceSdeRebuild",
		task:    eipnats.RebuildCurrentSDEVersion,
		publish: func(ctx context.Context, n *eipnats.NATS, _ taskOptions) error {
			return eipnats.TriggerRebuildCurrentSDEVersion(ctx, n)
		},
	},
	{
		command: "dispatchStatisticsRebuilds",
		task:    eipnats.DispatchStatisticsRebuilds,
		publish: func(ctx context.Context, n *eipnats.NATS, _ taskOptions) error {
			// Run by hand means run now: an operator waiting on the queue is not the
			// case the debounce exists for.
			return eipnats.PublishDispatchStatisticsRebuilds(ctx, n, eipnats.DrainRebuildQueueRequest{IgnoreDebounce: true})
		},
	},
	{
		command: "dispatchStatisticsReconciles",
		task:    eipnats.DispatchStatisticsReconciles,
		publish: func(ctx context.Context, n *eipnats.NATS, _ taskOptions) error {
			return eipnats.PublishDispatchStatisticsReconciles(ctx, n)
		},
	},
}

// dispatchLookup is derived from the table so a task cannot be runnable but
// unfindable, or findable under a name the table does not offer. Matching is
// case-insensitive for convenience.
func dispatchLookup() map[string]dispatch {
	lookup := make(map[string]dispatch, len(dispatchTable))
	for _, d := range dispatchTable {
		lookup[strings.ToLower(d.command)] = d
	}
	return lookup
}

// cliCommand is one command that runs in this process, as opposed to a task
// published to the worker. Its args string is what follows the name in the usage
// text, so a command's flags are described where it is declared.
type cliCommand struct {
	command string
	aliases []string
	args    string
	run     func(ctx context.Context, args []string) error
}

// cliTable is the allowlist for in-process commands, mirroring dispatchTable.
//
// One table rather than a switch, a usage block and a printed list that must
// agree: they had already drifted — encodeJobIdentity was runnable and in the
// usage text but absent from `tasks list`, so an operator reading the list would
// not know it existed.
var cliTable = []cliCommand{
	{command: "sdeVersion", run: func(context.Context, []string) error { return clicommands.RunSdeVersion() }},
	{command: "sdeVersionHistory", run: func(context.Context, []string) error { return clicommands.RunSdeVersionHistory() }},
	{command: "esiRateLimitGroups", run: func(context.Context, []string) error { return clicommands.RunEsiRateLimitGroups() }},
	{command: "resetEsiRateLimitGroups", run: func(context.Context, []string) error { return clicommands.RunResetEsiRateLimitGroups() }},
	{command: "workerQueues", run: func(context.Context, []string) error { return clicommands.RunWorkerQueues() }},
	{command: "purgeWorkerQueues", run: func(context.Context, []string) error { return clicommands.RunPurgeWorkerQueues() }},
	{command: "unlockSdeVersion", run: func(context.Context, []string) error { return clicommands.RunUnlockSdeVersion() }},
	{command: "backfillArchivedAt", args: "[-dry-run]", run: runBackfillArchivedAt},
	{command: "queueArchivedJobStatsRebuild", args: "[-all] [-account id] [-dry-run]", run: runQueueArchivedJobStatsRebuild},
	{command: "prepareRelease", args: "[-dry-run]", run: runPrepareRelease},
	{command: "rotateRefreshTokenKeys", args: "[--from=<version>] [--scan-batch-size=<n>] [--limit=<n>] [--dry-run]", run: runRotateRefreshTokenKeys},
	{command: "encodeJobIdentity", args: "[-collection <name>] [-limit <n>] [-dry-run]", run: runEncodeJobIdentity},
}

// cliLookup is derived from the table, aliases included, so a command cannot be
// runnable but unfindable. Matching is case-insensitive, as it is for tasks.
func cliLookup() map[string]cliCommand {
	lookup := make(map[string]cliCommand, len(cliTable))
	for _, c := range cliTable {
		lookup[strings.ToLower(c.command)] = c
		for _, alias := range c.aliases {
			lookup[strings.ToLower(alias)] = c
		}
	}
	return lookup
}

// usageText is built from the two tables, so a command reaches the usage text by
// being runnable rather than by being remembered.
func usageText() string {
	var b strings.Builder
	b.WriteString("Usage:\n")
	b.WriteString("  tasks list\n")
	for _, c := range cliTable {
		b.WriteString("  tasks " + c.command)
		if c.args != "" {
			b.WriteString(" " + c.args)
		}
		b.WriteString("\n")
	}
	for _, d := range dispatchTable {
		b.WriteString("  tasks " + d.command + "\n")
	}
	b.WriteString("\n" + usageExamples)
	return b.String()
}

// Handle runs command-mode task commands.
// Returns true when command mode is used (handled), false when normal service mode should run.
func Handle(ctx context.Context, args []string) (bool, error) {
	if len(args) == 0 || args[0] != "tasks" {
		return false, nil
	}
	if len(args) == 1 {
		return true, fmt.Errorf("%s", usageText())
	}

	if strings.EqualFold(args[1], "list") {
		return true, runList()
	}
	if command, known := cliLookup()[strings.ToLower(args[1])]; known {
		return true, command.run(ctx, args[2:])
	}
	return true, runTrigger(ctx, args[1:])
}

func runList() error {
	fmt.Println("Available commands:")
	fmt.Println("  CLI:")
	fmt.Println("  - list")
	for _, c := range cliTable {
		if c.args == "" {
			fmt.Printf("  - %s\n", c.command)
			continue
		}
		fmt.Printf("  - %s %s\n", c.command, c.args)
	}
	fmt.Println()
	fmt.Println("  Triggerable tasks:")
	for _, d := range allTasks() {
		fmt.Printf("  - %s (worker_task: %s, subject: %s, default_priority: %s)\n", d.command, d.task.Name, d.task.Subject, d.task.DefaultPriority)
	}
	return nil
}

func runTrigger(ctx context.Context, args []string) error {
	// A name that is neither a CLI command nor a triggerable task reaches here,
	// because dispatch falls through to the trigger path. Reject it up front:
	// otherwise the loop below reads the name as the task and the next token as a
	// stray argument, so a mistyped command is reported as a flag error and the
	// name it failed on is never mentioned.
	if len(args) > 0 {
		first := strings.TrimSpace(args[0])
		if first != "" && !strings.HasPrefix(first, "-") {
			if _, known := dispatchLookup()[strings.ToLower(first)]; !known {
				return fmt.Errorf("unknown command or task %q (use `tasks list`)\n\n%s", first, usageText())
			}
		}
	}

	// Support args in either order:
	// - <task-name> [--version=...]
	// - --version=... <task-name>
	var (
		version       int
		versionSet    bool
		taskNameInput string
	)

	consumeValue := func(i int) (string, int, error) {
		// supports --key=value and --key value
		if strings.Contains(args[i], "=") {
			parts := strings.SplitN(args[i], "=", 2)
			return parts[1], i, nil
		}
		if i+1 >= len(args) {
			return "", i, fmt.Errorf("missing value for %q", args[i])
		}
		return args[i+1], i + 1, nil
	}

	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case strings.HasPrefix(a, "version="), a == "version":
			return fmt.Errorf("invalid version flag %q: use --version=<int> (example: tasks applySdeVersion --version=3272045)", a)
		case strings.HasPrefix(a, "--version="):
			raw := strings.TrimPrefix(a, "--version=")
			parsed, err := strconv.Atoi(strings.TrimSpace(raw))
			if err != nil {
				return fmt.Errorf("invalid --version value %q: must be an integer", raw)
			}
			version = parsed
			versionSet = true
		case a == "--version":
			v, next, err := consumeValue(i)
			if err != nil {
				return fmt.Errorf("missing value for --version: use --version=<int> (example: tasks applySdeVersion --version=3272045)")
			}
			parsed, err := strconv.Atoi(strings.TrimSpace(v))
			if err != nil {
				return fmt.Errorf("invalid --version value %q: must be an integer (example: tasks applySdeVersion --version=3272045)", v)
			}
			version = parsed
			versionSet = true
			i = next
		case strings.HasPrefix(a, "--"):
			return fmt.Errorf("unknown flag %q\n\n%s", a, usageText())
		default:
			// First non-flag token is treated as the task name.
			if taskNameInput == "" {
				taskNameInput = a
			} else {
				return fmt.Errorf("unexpected extra argument %q\n\n%s", a, usageText())
			}
		}
	}

	taskNameInput = strings.TrimSpace(taskNameInput)
	if taskNameInput == "" {
		return fmt.Errorf("expected exactly one <task-name>\n\n%s", usageText())
	}
	d, exists := dispatchLookup()[strings.ToLower(taskNameInput)]
	if !exists {
		return fmt.Errorf("unknown or disabled task %q (use `tasks list`)", taskNameInput)
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.NATS)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	if _, err := clients.NATS.Tasks.Ensure(ctx); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}

	if err := d.publish(ctx, clients.NATS, taskOptions{version: version, versionSet: versionSet}); err != nil {
		return fmt.Errorf("failed to publish task %q: %w", d.task.Name, err)
	}

	fmt.Printf("Triggered task %q on subject %q\n", d.task.Name, d.task.Subject)
	return nil
}

func payloadToInterface(payload json.RawMessage) any {
	if payload == nil {
		return nil
	}
	// json.RawMessage preserves the original JSON bytes when marshaled, so the
	// operator's payload reaches the handler as they wrote it.
	return payload
}

func allTasks() []dispatch {
	return dispatchTable
}
