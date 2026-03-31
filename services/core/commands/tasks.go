package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	clicommands "eve-industry-planner/core/commands/cli"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	taskscore "eve-industry-planner/shared/tasks"
)

const usage = `Usage:
  eip-tasks list
  eip-tasks live-version
  eip-tasks previous-versions
  eip-tasks esi-groups
  eip-tasks reset-esi-groups
  eip-tasks market-prices-count
  eip-tasks asynq-queues
  eip-tasks asynq-purge
  eip-tasks unlock-version
  eip-tasks <task-name> [--priority=<priority_queue>] [--version=<int>] [--data='<json>']

Examples:
  eip-tasks list
  eip-tasks live-version
  eip-tasks previous-versions
  eip-tasks esi-groups
  eip-tasks reset-esi-groups
  eip-tasks market-prices-count
  eip-tasks asynq-queues
  eip-tasks asynq-purge
  eip-tasks unlock-version
  eip-tasks checkSDEUpdates
  eip-tasks applySDEVersion --version=12345
  eip-tasks recount-market-prices
`

// Enabled task allowlist.
// Add more tasks to this slice to expose them in `eip-tasks`.
// Matching is case-insensitive for user convenience.
var enabledTasks = []taskscore.Task{
	taskscore.CheckSDEUpdates,
	taskscore.ApplySDEVersion,
	taskscore.CountMarketPricesItems,
}

func enabledTasksLowerLookup() map[string]taskscore.Task {
	lookup := make(map[string]taskscore.Task, len(enabledTasks))
	for _, task := range enabledTasks {
		lookup[strings.ToLower(task.Name)] = task
	}
	// Friendly aliases.
	lookup["applysde"] = taskscore.ApplySDEVersion
	lookup["applysdeversion"] = taskscore.ApplySDEVersion
	lookup["recount-market-prices"] = taskscore.CountMarketPricesItems
	lookup["recountmarketprices"] = taskscore.CountMarketPricesItems
	lookup["countmarketprices"] = taskscore.CountMarketPricesItems
	return lookup
}

// Handle runs command-mode task commands.
// Returns true when command mode is used (handled), false when normal service mode should run.
func Handle(ctx context.Context, args []string) (bool, error) {
	if len(args) == 0 || args[0] != "tasks" {
		return false, nil
	}
	if len(args) == 1 {
		return true, fmt.Errorf("%s", usage)
	}

	switch args[1] {
	case "list":
		return true, runList()
	case "live-version", "live":
		return true, clicommands.RunLiveVersionInfo()
	case "previous-versions", "previous":
		return true, clicommands.RunPreviousVersionsInfo()
	case "esi-groups", "groups":
		return true, clicommands.RunESIRateLimiterGroups()
	case "reset-esi-groups", "esi-reset", "reset-groups":
		return true, clicommands.RunResetESIRateLimiterGroups()
	case "market-prices-count", "market-count", "mp-count":
		return true, clicommands.RunMarketPricesCount()
	case "asynq-queues", "queues-asynq", "asynq-info":
		return true, clicommands.RunAsynqQueuesInfo()
	case "asynq-purge", "purge-asynq", "clear-asynq":
		return true, clicommands.RunAsynqPurge()
	case "unlock-version", "unlock":
		return true, clicommands.RunUnlockSDEVersion()
	default:
		// Default: treat the first non-subcommand arg as the task-name.
		// Also accept legacy `trigger <task-name> ...` form.
		if args[1] == "trigger" {
			return true, runTrigger(ctx, args[2:])
		}
		return true, runTrigger(ctx, args[1:])
	}
}

func runList() error {
	fmt.Println("Available commands:")
	fmt.Println("  CLI:")
	fmt.Println("  - list")
	fmt.Println("  - live-version (alias: live)")
	fmt.Println("  - previous-versions (alias: previous)")
	fmt.Println("  - esi-groups (alias: groups)")
	fmt.Println("  - reset-esi-groups (aliases: esi-reset, reset-groups)")
	fmt.Println("  - market-prices-count (aliases: market-count, mp-count)")
	fmt.Println("  - asynq-queues (aliases: queues-asynq, asynq-info)")
	fmt.Println("  - asynq-purge (aliases: purge-asynq, clear-asynq)")
	fmt.Println("  - unlock-version (alias: unlock)")
	fmt.Println()
	fmt.Println("  Triggerable tasks:")
	for _, task := range allTasks() {
		fmt.Printf("  - %s (subject: %s, default_priority: %s)\n", task.Name, task.Subject, task.DefaultPriority)
	}
	return nil
}

func runTrigger(ctx context.Context, args []string) error {
	// Support args in either order:
	// - <task-name> [--priority=...] [--data=...]
	// - --priority=... --data=... <task-name>
	var (
		priority      string
		version       int
		versionSet    bool
		data          string
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
		case strings.HasPrefix(a, "priority="):
			priority = strings.TrimPrefix(a, "priority=")
		case a == "priority":
			v, next, err := consumeValue(i)
			if err != nil {
				return err
			}
			priority = v
			i = next
		case strings.HasPrefix(a, "--priority="):
			priority = strings.TrimPrefix(a, "--priority=")
		case a == "--priority":
			v, next, err := consumeValue(i)
			if err != nil {
				return err
			}
			priority = v
			i = next
		case strings.HasPrefix(a, "data="):
			data = strings.TrimPrefix(a, "data=")
		case a == "data":
			v, next, err := consumeValue(i)
			if err != nil {
				return err
			}
			data = v
			i = next
		case strings.HasPrefix(a, "--data="):
			data = strings.TrimPrefix(a, "--data=")
		case a == "--data":
			v, next, err := consumeValue(i)
			if err != nil {
				return err
			}
			data = v
			i = next
		case strings.HasPrefix(a, "version="), a == "version":
			return fmt.Errorf("invalid version flag %q: use --version=<int> (example: eip-tasks applySDEVersion --version=3272045)", a)
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
				return fmt.Errorf("missing value for --version: use --version=<int> (example: eip-tasks applySDEVersion --version=3272045)")
			}
			parsed, err := strconv.Atoi(strings.TrimSpace(v))
			if err != nil {
				return fmt.Errorf("invalid --version value %q: must be an integer (example: --version=3272045)", v)
			}
			version = parsed
			versionSet = true
			i = next
		case strings.HasPrefix(a, "--"):
			return fmt.Errorf("unknown flag %q\n\n%s", a, usage)
		default:
			// First non-flag token is treated as the task name.
			if taskNameInput == "" {
				taskNameInput = a
			} else {
				return fmt.Errorf("unexpected extra argument %q\n\n%s", a, usage)
			}
		}
	}

	taskNameInput = strings.TrimSpace(taskNameInput)
	if taskNameInput == "" {
		return fmt.Errorf("trigger requires exactly one <task-name>\n\n%s", usage)
	}
	taskNameLower := strings.ToLower(taskNameInput)

	lookup := enabledTasksLowerLookup()
	task, exists := lookup[taskNameLower]
	if !exists {
		return fmt.Errorf("unknown or disabled task %q (use `eip-tasks list`)", taskNameInput)
	}

	payload, err := buildTaskPayload(task, versionSet, version, data)
	if err != nil {
		return err
	}

	clients, err := shared.ConnectServices(ctx, shared.ServiceNATS)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	if err := natscore.EnsureWorkerTaskStream(clients.JetStream); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}

	if err := natscore.PublishTask(clients.JetStream, task.Subject, task.Name, payloadToInterface(payload), clients.NATS, priority); err != nil {
		return fmt.Errorf("failed to publish task %q: %w", task.Name, err)
	}

	fmt.Printf("Triggered task %q on subject %q", task.Name, task.Subject)
	if priority != "" {
		fmt.Printf(" with priority override %q", priority)
	}
	fmt.Println()
	return nil
}

func parseJSONRaw(data string) (json.RawMessage, error) {
	trimmed := strings.TrimSpace(data)
	if trimmed == "" {
		return nil, nil
	}
	if !json.Valid([]byte(trimmed)) {
		return nil, fmt.Errorf("must be valid JSON")
	}
	return json.RawMessage(trimmed), nil
}

func buildTaskPayload(task taskscore.Task, versionSet bool, version int, rawJSON string) (json.RawMessage, error) {
	switch task.Name {
	case taskscore.ApplySDEVersion.Name:
		if !versionSet {
			return nil, fmt.Errorf("task %q requires --version=<int> (example: eip-tasks applySDEVersion --version=3272045)", task.Name)
		}
		if version <= 0 {
			return nil, fmt.Errorf("task %q requires --version to be a positive integer (> 0), got %d", task.Name, version)
		}
		payload, err := json.Marshal(natscore.SDEApplyVersionRequest{
			BuildNumber: version,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to marshal apply-version payload: %w", err)
		}
		return json.RawMessage(payload), nil
	default:
		return parseJSONRaw(rawJSON)
	}
}

func payloadToInterface(payload json.RawMessage) interface{} {
	if payload == nil {
		return nil
	}
	// PublishTask marshals this value as JSON into TaskMessage.Data.
	// json.RawMessage preserves the original JSON bytes when marshaled.
	return payload
}

func allTasks() []taskscore.Task {
	return enabledTasks
}

// Command-mode invocations are one-shot; they should close resources immediately,
// not wait for SIGINT/SIGTERM like the long-running services do.
func runImmediateCleanups(cleanups ...func(context.Context)) {
	for _, fn := range cleanups {
		if fn == nil {
			continue
		}
		cctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		func() {
			defer cancel()
			fn(cctx)
		}()
	}
}
