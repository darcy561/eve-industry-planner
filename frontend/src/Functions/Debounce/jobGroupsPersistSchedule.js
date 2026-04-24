import { persistJobGroupsToApi } from "../Groups/persistJobGroupsToApi.js";
import { createPersistDebounce } from "./helpers/createPersistDebounce.js";

const debounce = createPersistDebounce({
  delayMs: 2000,
  attachTabLifecycleFlush: true,
  onRun: () => {
    void persistJobGroupsToApi();
  },
});

/** Schedules a debounced persist of all groups (`PUT /api/v1/groups`). */
export function scheduleDebouncedGroupSave() {
  debounce.schedule();
}

/** Clears the debounce timer and saves immediately. */
export async function flushPendingGroupSave() {
  await debounce.flushPending();
}
