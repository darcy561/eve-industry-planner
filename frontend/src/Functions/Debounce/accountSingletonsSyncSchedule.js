/**
 * Collapses burst NATS deliveries (users + application_settings saves) into one API round-trip.
 */

import { loadAccountDocuments } from "../DocumentLoad/loadAccountDocuments.js";
import { createPersistDebounce } from "./helpers/createPersistDebounce.js";

const debounce = createPersistDebounce({
  delayMs: 120,
  shouldSchedule: () => true,
  onRun: () => loadAccountDocuments(),
});

export function scheduleDebouncedAccountDocumentsSync() {
  debounce.schedule();
}
