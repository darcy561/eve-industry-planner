import { persistJobDocumentsToApi } from "../JobDocuments/persistJobDocumentsToApi.js";
import { createPersistDebounce } from "./helpers/createPersistDebounce.js";

const debounce = createPersistDebounce({
  delayMs: 2000,
  attachTabLifecycleFlush: true,
  onRun: () => {
    void persistJobDocumentsToApi();
  },
});

/** Schedules a debounced persist of queued job documents (`PUT /api/v1/job-documents`). */
export function scheduleDebouncedJobDocumentsSave() {
  debounce.schedule();
}

/** Clears the debounce timer and saves immediately. */
export async function flushPendingJobDocumentsSave() {
  await debounce.flushPending();
}
