# Patch Notes

## Summary

This patch updates the SDE maintenance workflow, renames the in-container task runner interface, improves static-data versioned asset URLs, and refreshes local development bootstrap behavior.

## Highlights

- Added a forced SDE rebuild path that can rebuild the currently active static-data build in place while atomically swapping `live_data`, archiving the displaced snapshot, and preserving unique version labels such as `123456_v2`.
- Extended SDE storage/version helpers so archived versions and regenerated live versions receive deterministic names, and added coverage around replace-current rebuild behavior.
- Registered the new `rebuildCurrentSDEVersion` worker task and exposed it through the renamed `tasks` CLI wrapper and updated task subcommands.
- Updated static-data metadata responses to prefer `BuildVersion` when generating cache-busting versioned asset URLs.
- Refreshed project bootstrap/update scripts so `make update-files` also updates `scripts/version-tracker.sh`, and `version-tracker.sh` now tracks `scripts/download-setup-scripts.sh`.
- Refreshed Go and frontend lockfiles/dependencies alongside the task and SDE pipeline changes.

## Operator Notes

- The old `services/core/eip-tasks.sh` wrapper has been replaced by `services/core/tasks.sh`.
- The task command surface now uses names like `tasks sdeVersion`, `tasks workerQueues`, and `tasks forceSdeRebuild`.
- Rebuilding the current SDE version archives the replaced snapshot before publishing the regenerated live dataset.
