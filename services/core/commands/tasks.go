package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	clicommands "eve-industry-planner/core/commands/cli"
	archivedjobsched "eve-industry-planner/core/scheduler/archivedjobs"
	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared"
	taskscore "eve-industry-planner/shared/tasks"
)

const usage = `Usage:
  tasks list
  tasks sdeVersion
  tasks sdeVersionHistory
  tasks esiRateLimitGroups
  tasks resetEsiRateLimitGroups
  tasks displayMarketPriceCount
  tasks workerQueues
  tasks purgeWorkerQueues
  tasks unlockSdeVersion
  tasks processArchivedBuildStats
  tasks startArchivedJobProcessing
  tasks forceSdeRebuild
  tasks importArchivedJobsFromFirestore [flags]
  tasks importUserAccountsFromFirestore [flags]
  tasks markArchivedJobsUnprocessed [-all] [-account id] [-dry-run]
  tasks resetBuildStats [-account id] [-dry-run]
  tasks <task-name> [--priority=<priority_queue>] [--version=<int>] [--data='<json>']

Examples:
  tasks list
  tasks sdeVersion
  tasks sdeVersionHistory
  tasks esiRateLimitGroups
  tasks resetEsiRateLimitGroups
  tasks displayMarketPriceCount
  tasks workerQueues
  tasks purgeWorkerQueues
  tasks unlockSdeVersion
  tasks importArchivedJobsFromFirestore
  tasks importArchivedJobsFromFirestore -credentials /app/adminSDK.json
  tasks importArchivedJobsFromFirestore -reprocess -credentials /app/adminSDK.json
  tasks importUserAccountsFromFirestore -dry-run -dev
  tasks importUserAccountsFromFirestore -account <firebase_uid> -live
  tasks markArchivedJobsUnprocessed -all -dry-run
  tasks markArchivedJobsUnprocessed -account <firebase_uid> -dry-run
  tasks resetBuildStats -dry-run
  tasks resetBuildStats -account <firebase_uid>
  tasks checkSdeUpdates
  tasks applySdeVersion --version=12345
  tasks recountMarketPrices
  tasks processArchivedBuildStats
  tasks startArchivedJobProcessing
  tasks processArchivedBuildStats --data='{"account_id":"<firebase_uid>"}'
  tasks forceSdeRebuild
`

// Enabled task allowlist.
// Add more tasks to this slice to expose them in `tasks`.
// Matching is case-insensitive for user convenience.
var enabledTasks = []taskscore.Task{
	taskscore.CheckSDEUpdates,
	taskscore.ApplySDEVersion,
	taskscore.RebuildCurrentSDEVersion,
	taskscore.CountMarketPricesItems,
	taskscore.ProcessArchivedBuildStats,
}

func enabledTasksLowerLookup() map[string]taskscore.Task {
	return map[string]taskscore.Task{
		"checksdeupdates":           taskscore.CheckSDEUpdates,
		"applysdeversion":           taskscore.ApplySDEVersion,
		"forcesderebuild":           taskscore.RebuildCurrentSDEVersion,
		"recountmarketprices":       taskscore.CountMarketPricesItems,
		"processarchivedbuildstats": taskscore.ProcessArchivedBuildStats,
	}
}

func commandTaskName(task taskscore.Task) string {
	switch task.Name {
	case taskscore.CheckSDEUpdates.Name:
		return "checkSdeUpdates"
	case taskscore.ApplySDEVersion.Name:
		return "applySdeVersion"
	case taskscore.RebuildCurrentSDEVersion.Name:
		return "forceSdeRebuild"
	case taskscore.CountMarketPricesItems.Name:
		return "recountMarketPrices"
	case taskscore.ProcessArchivedBuildStats.Name:
		return "processArchivedBuildStats"
	default:
		return task.Name
	}
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
	case "sdeVersion":
		return true, clicommands.RunSdeVersion()
	case "sdeVersionHistory":
		return true, clicommands.RunSdeVersionHistory()
	case "esiRateLimitGroups":
		return true, clicommands.RunEsiRateLimitGroups()
	case "resetEsiRateLimitGroups":
		return true, clicommands.RunResetEsiRateLimitGroups()
	case "displayMarketPriceCount":
		return true, clicommands.RunDisplayMarketPriceCount()
	case "workerQueues":
		return true, clicommands.RunWorkerQueues()
	case "purgeWorkerQueues":
		return true, clicommands.RunPurgeWorkerQueues()
	case "unlockSdeVersion":
		return true, clicommands.RunUnlockSdeVersion()
	case "importArchivedJobsFromFirestore":
		return true, runImportArchivedJobsFromFirestoreScan(ctx, args[2:])
	case "importUserAccountsFromFirestore":
		return true, runImportUserAccountsFromFirestoreScan(ctx, args[2:])
	case "markArchivedJobsUnprocessed":
		return true, runMarkArchivedJobsUnprocessed(ctx, args[2:])
	case "resetBuildStats":
		return true, runResetBuildStats(ctx, args[2:])
	case "startArchivedJobProcessing":
		if len(args) > 2 {
			return true, fmt.Errorf("startArchivedJobProcessing: takes no arguments (remove %q)\n\n%s", strings.Join(args[2:], " "), usage)
		}
		return true, runFanOutArchivedBuildStats(ctx)
	default:
		return true, runTrigger(ctx, args[1:])
	}
}

func runList() error {
	fmt.Println("Available commands:")
	fmt.Println("  CLI:")
	fmt.Println("  - list")
	fmt.Println("  - sdeVersion")
	fmt.Println("  - sdeVersionHistory")
	fmt.Println("  - esiRateLimitGroups")
	fmt.Println("  - resetEsiRateLimitGroups")
	fmt.Println("  - displayMarketPriceCount")
	fmt.Println("  - workerQueues")
	fmt.Println("  - purgeWorkerQueues")
	fmt.Println("  - unlockSdeVersion")
	fmt.Println("  - importArchivedJobsFromFirestore [-unprocessed-only] [-reprocess] [-credentials path] [-firebase-project-id id]")
	fmt.Println("  - importUserAccountsFromFirestore [-dev|-live|-credentials path] [-firebase-project-id id] [-account uid] [-dry-run]")
	fmt.Println("  - markArchivedJobsUnprocessed [-all] [-account id] [-dry-run]")
	fmt.Println("  - resetBuildStats [-account id] [-dry-run]")
	fmt.Println("  - startArchivedJobProcessing (same fan-out as hourly cron; enqueue per-account build_stats work now)")
	fmt.Println()
	fmt.Println("  Triggerable tasks:")
	for _, task := range allTasks() {
		fmt.Printf("  - %s (worker_task: %s, subject: %s, default_priority: %s)\n", commandTaskName(task), task.Name, task.Subject, task.DefaultPriority)
	}
	return nil
}

// runFanOutArchivedBuildStats enqueues one ProcessArchivedBuildStats worker task per account that has
// unprocessed archivedJobs rows (same behavior as the core hourly cron).
func runFanOutArchivedBuildStats(ctx context.Context) error {
	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo, shared.ServiceNATS)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)
	if err := natscore.EnsureWorkerTaskStream(clients.JetStream); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}
	deps := contract.Dependencies{
		JSContext: clients.JetStream,
		NATS:      clients.NATS,
		Mongo:     clients.Mongo,
	}
	if err := archivedjobsched.PublishProcessArchivedBuildStatsPerAccount(ctx, deps); err != nil {
		return err
	}
	fmt.Println("Triggered archived build stats fan-out (per-account worker tasks published)")
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
		return fmt.Errorf("expected exactly one <task-name>\n\n%s", usage)
	}
	lookup := enabledTasksLowerLookup()
	task, exists := lookup[strings.ToLower(taskNameInput)]
	if !exists {
		return fmt.Errorf("unknown or disabled task %q (use `tasks list`)", taskNameInput)
	}

	payload, err := buildTaskPayload(task, versionSet, version, data)
	if err != nil {
		return err
	}

	// Fan-out: one worker task per account with unprocessed archived jobs (same as core cron).
	if task.Name == taskscore.ProcessArchivedBuildStats.Name && payload == nil {
		return runFanOutArchivedBuildStats(ctx)
	}

	clients, err := shared.ConnectServices(ctx, shared.ServiceNATS)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	if err := natscore.EnsureWorkerTaskStream(clients.JetStream); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}

	publishPayload := payloadToInterface(payload)
	if task.Name == taskscore.ProcessArchivedBuildStats.Name {
		var req natscore.ProcessArchivedBuildStatsRequest
		if err := json.Unmarshal(payload, &req); err != nil || req.AccountID == "" {
			return fmt.Errorf("task %q requires --data='{\"account_id\":\"...\"}' or omit --data to fan out all accounts", commandTaskName(task))
		}
		publishPayload = req
	}

	if err := natscore.PublishTask(ctx, clients.JetStream, task.Subject, task.Name, publishPayload, clients.NATS, priority); err != nil {
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
			return nil, fmt.Errorf("task %q requires --version=<int> (example: tasks applySdeVersion --version=3272045)", commandTaskName(task))
		}
		if version <= 0 {
			return nil, fmt.Errorf("task %q requires --version to be a positive integer (> 0), got %d", commandTaskName(task), version)
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
