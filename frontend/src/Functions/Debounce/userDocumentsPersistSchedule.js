import useUsersStore from "../../Zustand/usersStore.js";
import {
  saveApplicationSettings,
  saveUserAccountAndApplicationSettings,
  saveUserAccountDocument,
} from "../Endpoints/Private/userDocument.js";
import { attachFlushOnHiddenAndUnload } from "./helpers/attachFlushOnHiddenAndUnload.js";
import { createPersistDebounce } from "./helpers/createPersistDebounce.js";

const DELAY_MS = 2000;

function isLoggedIn() {
  return Boolean(useUsersStore.getState().account.isLoggedIn);
}

const debounceApplicationSettings = createPersistDebounce({
  delayMs: DELAY_MS,
  shouldSchedule: isLoggedIn,
  onRun: () => void saveApplicationSettings(),
});

const debounceUserAccount = createPersistDebounce({
  delayMs: DELAY_MS,
  shouldSchedule: isLoggedIn,
  onRun: () => void saveUserAccountDocument(),
});

const debounceCombined = createPersistDebounce({
  delayMs: DELAY_MS,
  shouldSchedule: isLoggedIn,
  onRun: () => void saveUserAccountAndApplicationSettings(),
});

/**
 * `true` while a trailing debounce is still waiting for
 * {@link saveUserAccountAndApplicationSettings} (2s by default). Used to avoid
 * clobbering linked refresh tokens with a stale server snapshot.
 */
export function isCombinedUserAccountSaveDebouncePending() {
  return debounceCombined.isPending();
}

export function scheduleDebouncedApplicationSettingsSave() {
  debounceApplicationSettings.schedule();
}

export function scheduleDebouncedUserAccountDocumentSave() {
  debounceUserAccount.schedule();
}

export function scheduleDebouncedUserAccountAndApplicationSettingsSave() {
  debounceCombined.schedule();
}

export async function flushPendingUserDocumentSaves() {
  const hadCombinedTimer = debounceCombined.isPending();
  const hadApplicationSettingsTimer = debounceApplicationSettings.isPending();
  const hadUserAccountTimer = debounceUserAccount.isPending();

  debounceApplicationSettings.cancel();
  debounceUserAccount.cancel();
  debounceCombined.cancel();

  if (!isLoggedIn()) return;

  if (hadCombinedTimer) {
    await saveUserAccountAndApplicationSettings();
    return;
  }

  const requests = [];
  if (hadApplicationSettingsTimer) requests.push(saveApplicationSettings());
  if (hadUserAccountTimer) requests.push(saveUserAccountDocument());
  if (requests.length > 0) {
    await Promise.all(requests);
  }
}

attachFlushOnHiddenAndUnload(() => flushPendingUserDocumentSaves());
