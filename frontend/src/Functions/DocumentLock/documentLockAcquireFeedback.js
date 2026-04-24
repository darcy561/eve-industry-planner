/** Window after explicit grant APIs where {@link shouldSuppressDocumentLockVacancyNotice} is true */
const SUPPRESS_MS = 2000;

let suppressVacancyNoticeUntil = 0;

/**
 * Call when edit access was granted via request-access or handoff-claim so
 * {@link ../../Hooks/useDocumentLock.js} vacancy detection does not show a second snackbar.
 */
export function suppressDocumentLockVacancyNotice() {
  suppressVacancyNoticeUntil = Date.now() + SUPPRESS_MS;
}

/** @returns {boolean} */
export function shouldSuppressDocumentLockVacancyNotice() {
  return Date.now() < suppressVacancyNoticeUntil;
}
