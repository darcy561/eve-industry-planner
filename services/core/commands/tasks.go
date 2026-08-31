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
	firestoreimport "eve-industry-planner/core/migration/firestoreimport"
	eipnats "eve-industry-planner/shared/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

const usage = `Usage:
  tasks list
  tasks sdeVersion
  tasks sdeVersionHistory
  tasks esiRateLimitGroups
  tasks resetEsiRateLimitGroups
  tasks workerQueues
  tasks purgeWorkerQueues
  tasks unlockSdeVersion
  tasks forceSdeRebuild
  tasks drainAccountStatsRebuildQueue
  tasks rotateRefreshTokenKeys [--from=<version>] [--scan-batch-size=<n>] [--limit=<n>] [--dry-run]
  tasks migrateEncryptedCloudRefreshTokens [--scan-batch-size=<n>] [--limit=<n>] [--dry-run]
  tasks migrateUserCloudAccountsToUserDoc [--scan-batch-size=<n>] [--limit=<n>] [--dry-run]
  tasks importArchivedJobsFromFirestore [flags]
  tasks importUserAccountsFromFirestore [flags]
  tasks importWatchlistFromFirestore [flags]
  tasks importJobGroupsFromFirestore [flags]
  tasks importUserJobDocumentsFromFirestore [flags]
  tasks backfillArchivedAt [-dry-run]
  tasks queueArchivedJobStatsRebuild [-all] [-account id] [-dry-run]
  tasks <task-name> [--priority=<priority_queue>] [--version=<int>] [--data='<json>']

Examples:
  tasks list
  tasks sdeVersion
  tasks sdeVersionHistory
  tasks esiRateLimitGroups
  tasks resetEsiRateLimitGroups
  tasks workerQueues
  tasks purgeWorkerQueues
  tasks unlockSdeVersion
  tasks importArchivedJobsFromFirestore
  tasks importArchivedJobsFromFirestore -credentials /app/adminSDK.json
  tasks importArchivedJobsFromFirestore -reprocess -credentials /app/adminSDK.json
  tasks importUserAccountsFromFirestore -dry-run -dev
  tasks importUserAccountsFromFirestore -account <firebase_uid> -live
  tasks importWatchlistFromFirestore -dry-run -dev
  tasks importWatchlistFromFirestore -account <firebase_uid> -live
  tasks importJobGroupsFromFirestore -dry-run -dev
  tasks importJobGroupsFromFirestore -account <firebase_uid> -live
  tasks importUserJobDocumentsFromFirestore -dry-run -dev
  tasks importUserJobDocumentsFromFirestore -live
  tasks importUserJobDocumentsFromFirestore -live -skip-auth-recency
  tasks importUserJobDocumentsFromFirestore -account <firebase_uid> -live
  tasks importUserJobDocumentsFromFirestore -account <firebase_uid> -enqueue -live
  tasks importUserJobDocumentsFromFirestore -inline -live
  tasks queueArchivedJobStatsRebuild -all -dry-run
  tasks queueArchivedJobStatsRebuild -account <firebase_uid> -dry-run
  tasks checkSdeUpdates
  tasks applySdeVersion --version=12345
  tasks forceSdeRebuild
  tasks rotateRefreshTokenKeys --from=v1 --scan-batch-size=500
  tasks migrateEncryptedCloudRefreshTokens --scan-batch-size=500
  tasks migrateUserCloudAccountsToUserDoc --scan-batch-size=500
`

// Enabled task allowlist.
// Add more tasks to this slice to expose them in `tasks`.
// Matching is case-insensitive for user convenience.
var enabledTasks = []taskscore.Task{
	taskscore.CheckSDEUpdates,
	taskscore.ApplySDEVersion,
	taskscore.RebuildCurrentSDEVersion,
	taskscore.DrainAccountStatsRebuildQueue,
}

func enabledTasksLowerLookup() map[string]taskscore.Task {
	return map[string]taskscore.Task{
		"checksdeupdates":               taskscore.CheckSDEUpdates,
		"applysdeversion":               taskscore.ApplySDEVersion,
		"forcesderebuild":               taskscore.RebuildCurrentSDEVersion,
		"drainaccountstatsrebuildqueue": taskscore.DrainAccountStatsRebuildQueue,
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
	case taskscore.DrainAccountStatsRebuildQueue.Name:
		return "drainAccountStatsRebuildQueue"
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
	case "importWatchlistFromFirestore":
		return true, firestoreimport.RunImportWatchlistFromFirestore(ctx, args[2:])
	case "importJobGroupsFromFirestore":
		return true, firestoreimport.RunImportJobGroupsFromFirestore(ctx, args[2:])
	case "importUserJobDocumentsFromFirestore", "importUserJobDocuementsFromFirestore":
		return true, firestoreimport.RunImportUserJobDocumentsFromFirestore(ctx, args[2:])
	case "backfillArchivedAt":
		return true, runBackfillArchivedAt(ctx, args[2:])
	case "queueArchivedJobStatsRebuild":
		return true, runQueueArchivedJobStatsRebuild(ctx, args[2:])
	case "rotateRefreshTokenKeys":
		return true, runRotateRefreshTokenKeys(ctx, args[2:])
	case "encodeJobIdentity":
		return true, runEncodeJobIdentity(ctx, args[2:])
	case "migrateEncryptedCloudRefreshTokens":
		return true, runEncryptCloudRefreshTokensMigration(ctx, args[2:])
	case "migrateUserCloudAccountsToUserDoc":
		return true, runMigrateUserCloudAccountsToUserDoc(ctx, args[2:])
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
	fmt.Println("  - workerQueues")
	fmt.Println("  - purgeWorkerQueues")
	fmt.Println("  - unlockSdeVersion")
	fmt.Println("  - importArchivedJobsFromFirestore [-unprocessed-only] [-reprocess] [-credentials path] [-firebase-project-id id]")
	fmt.Println("  - importUserAccountsFromFirestore [-dev|-live|-credentials path] [-firebase-project-id id] [-account uid] [-dry-run] [-login-within duration]")
	fmt.Println("  - importWatchlistFromFirestore [-dev|-live|-credentials path] [-firebase-project-id id] [-account uid] [-dry-run] [-login-within duration]")
	fmt.Println("  - importJobGroupsFromFirestore [-dev|-live|-credentials path] [-firebase-project-id id] [-account uid] [-dry-run] [-login-within duration]")
	fmt.Println("  - importUserJobDocumentsFromFirestore [-dev|-live|-credentials path] [-firebase-project-id id] [-account uid] [-dry-run] [-inline] [-enqueue] [-skip-auth-recency]")
	fmt.Println("  - backfillArchivedAt [-dry-run]")
	fmt.Println("  - queueArchivedJobStatsRebuild [-all] [-account id] [-dry-run]")
	fmt.Println("  - rotateRefreshTokenKeys [--from=<version>] [--scan-batch-size=<n>] [--limit=<n>] [--dry-run]")
	fmt.Println("  - migrateEncryptedCloudRefreshTokens [--scan-batch-size=<n>] [--limit=<n>] [--dry-run]")
	fmt.Println("  - migrateUserCloudAccountsToUserDoc [--scan-batch-size=<n>] [--limit=<n>] [--dry-run]")
	fmt.Println()
	fmt.Println("  Triggerable tasks:")
	for _, task := range allTasks() {
		fmt.Printf("  - %s (worker_task: %s, subject: %s, default_priority: %s)\n", commandTaskName(task), task.Name, task.Subject, task.DefaultPriority)
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
			if _, known := enabledTasksLowerLookup()[strings.ToLower(first)]; !known {
				return fmt.Errorf("unknown command or task %q (use `tasks list`)\n\n%s", first, usage)
			}
		}
	}

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

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.NATS)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	if err := eipnats.EnsureWorkerTaskStream(clients.NATS.JS()); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}

	publishPayload := payloadToInterface(payload)

	if err := eipnats.PublishTask(ctx, clients.NATS, task.Subject, task.Name, publishPayload, priority); err != nil {
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
		payload, err := json.Marshal(eipnats.SDEApplyVersionRequest{
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

func payloadToInterface(payload json.RawMessage) any {
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
