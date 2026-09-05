/**
 * Builds the SET_IS_LOADING dispatch payload from hook-style arguments.
 *
 * @param {boolean} isLoading
 * @param {string | undefined | null} [loadingMessage] - Shown under the spinner when `isLoading` is true; ignored when false or blank
 * @returns {boolean | { isLoading: true, loadingMessage: string }}
 */
export function buildSetIsLoadingActionPayload(isLoading, loadingMessage) {
  if (!isLoading) {
    return false;
  }
  if (
    loadingMessage !== undefined &&
    loadingMessage !== null &&
    String(loadingMessage).trim() !== ""
  ) {
    return { isLoading: true, loadingMessage: String(loadingMessage) };
  }
  return true;
}

/**
 * Normalises SET_IS_LOADING reducer payloads (legacy boolean or object form).
 *
 * @param {boolean | { isLoading: boolean, loadingMessage?: string }} payload
 * @returns {{ isLoading: boolean, loadingMessage: string | undefined }}
 */
export function normalizeSetIsLoadingPayload(payload) {
  if (typeof payload === "boolean") {
    return { isLoading: payload, loadingMessage: undefined };
  }
  if (payload && typeof payload === "object" && "isLoading" in payload) {
    const isLoading = Boolean(payload.isLoading);
    const raw = payload.loadingMessage;
    const loadingMessage =
      isLoading &&
      raw != null &&
      String(raw).trim() !== ""
        ? String(raw)
        : undefined;
    return { isLoading, loadingMessage };
  }
  return { isLoading: Boolean(payload), loadingMessage: undefined };
}
