import useUsersStore from "../../Zustand/usersStore.js";
import { createPersistDebounce } from "./helpers/createPersistDebounce.js";

const DELAY_MS = 2000;

// Which planners have unsaved changes, so a member who edits one planner's
// settings and switches before the debounce fires still has the first write.
const pendingOwners = new Set();

const debounce = createPersistDebounce({
  delayMs: DELAY_MS,
  onRun: () => flushPendingPlannerSettingsSaves(),
  attachTabLifecycleFlush: true,
});

/** @param {string} ownerHandle */
export function scheduleDebouncedPlannerSettingsSave(ownerHandle) {
  if (!ownerHandle) return;
  pendingOwners.add(ownerHandle);
  debounce.schedule();
}

/** @returns {Promise<void>} */
export async function flushPendingPlannerSettingsSaves() {
  const owners = [...pendingOwners];
  pendingOwners.clear();
  if (owners.length === 0) return;

  const { savePlannerExtrasCategories } =
    useUsersStore.getState().plannerSettings.actions;
  await Promise.all(
    owners.map((owner) =>
      savePlannerExtrasCategories(owner).catch((e) =>
        console.error("[plannerSettings] save failed", owner, e),
      ),
    ),
  );
}
