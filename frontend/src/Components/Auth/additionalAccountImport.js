/** `state` prefix for OAuth to link a character from the “Additional accounts” flow (not main login). */
export const EVE_SSO_ADDITIONAL_ACCOUNT_STATE = "additional";

/** Same-origin channel carrying the auth `code` from the callback tab back to the tab that opened it. */
const ADDITIONAL_IMPORT_CHANNEL = "eip.additional-account-import";

const MESSAGE_AUTH_CODE = "auth-code";
const MESSAGE_ACK = "ack";

const DEFAULT_ADDITIONAL_IMPORT_LISTENER_MS = 180_000;

/** How long the callback tab waits to be acked before closing anyway. */
const ACK_WAIT_MS = 2_000;

const POPUP_POLL_MS = 500;

/** Grace for a code already in flight when the callback tab closed itself. */
const POPUP_CLOSE_GRACE_MS = 1_500;

/**
 * A popup closed without broadcasting a code cannot deliver one, so fail in about a second
 * instead of waiting out the listener timeout. Blocked popups give no handle to watch.
 *
 * @param {Window | null} popup
 * @param {() => void} onClosed
 * @returns {() => void} cancel — also cancels a grace period already under way
 */
export function watchForClosedImportPopup(popup, onClosed) {
  if (!popup) return () => {};
  let graceTimer = null;
  const poll = setInterval(() => {
    if (!popup.closed) return;
    clearInterval(poll);
    graceTimer = setTimeout(onClosed, POPUP_CLOSE_GRACE_MS);
  }, POPUP_POLL_MS);
  return () => {
    clearInterval(poll);
    if (graceTimer) clearTimeout(graceTimer);
  };
}

/**
 * @param {string} nonce
 * @returns {string} OAuth `state` for an additional-account import
 */
export function buildAdditionalAccountState(nonce) {
  return `${EVE_SSO_ADDITIONAL_ACCOUNT_STATE}:${nonce}`;
}

/**
 * @param {string | null} state
 * @returns {string | null} The nonce, or `null` when this is not an additional-import state.
 */
export function parseAdditionalAccountState(state) {
  if (typeof state !== "string") {
    return null;
  }
  const prefix = `${EVE_SSO_ADDITIONAL_ACCOUNT_STATE}:`;
  if (!state.startsWith(prefix)) {
    return null;
  }
  const nonce = state.slice(prefix.length).trim();
  return nonce || null;
}

/**
 * Parent window: listen for the OAuth callback tab to broadcast the auth `code` for `nonce`.
 * Messages carrying any other nonce belong to another tab's import and are ignored.
 *
 * @param {object} opts
 * @param {string} opts.nonce
 * @param {(code: string) => void} opts.onAuthCode
 * @param {() => void} [opts.onTimeout] — if the code never arrives (same timeout as long SSO session)
 * @param {number} [opts.timeoutMs]
 * @returns {() => void} `detach` — also called internally when a code is received
 */
export function subscribeToAdditionalUserAuthCode({
  nonce,
  onAuthCode,
  onTimeout,
  timeoutMs = DEFAULT_ADDITIONAL_IMPORT_LISTENER_MS,
}) {
  const channel = new BroadcastChannel(ADDITIONAL_IMPORT_CHANNEL);
  const onMessage = (event) => {
    const message = event?.data;
    if (
      message?.type !== MESSAGE_AUTH_CODE ||
      message.nonce !== nonce ||
      !message.code
    ) {
      return;
    }
    channel.postMessage({ type: MESSAGE_ACK, nonce });
    detach();
    onAuthCode(message.code);
  };
  const timer = setTimeout(() => {
    detach();
    onTimeout?.();
  }, timeoutMs);
  function detach() {
    clearTimeout(timer);
    channel.close();
  }
  channel.addEventListener("message", onMessage);
  return detach;
}

/**
 * When opening EVE OAuth in a popup to link another character, the callback broadcasts the code
 * to the opening tab and closes. Without an ack the code is unrecoverable — the opener is gone or
 * has timed out — so the window closes either way rather than stranding the user on a blank tab.
 *
 * @param {string | null} state
 * @param {string | null} authCode
 * @returns {Promise<boolean>} `true` if this request was fully handled (window closed).
 */
export async function tryCompleteAdditionalAccountImportWindow(state, authCode) {
  const nonce = parseAdditionalAccountState(state);
  if (nonce === null) {
    return false;
  }
  const channel = new BroadcastChannel(ADDITIONAL_IMPORT_CHANNEL);
  try {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, ACK_WAIT_MS);
      channel.addEventListener("message", (event) => {
        if (event?.data?.type === MESSAGE_ACK && event.data.nonce === nonce) {
          clearTimeout(timer);
          resolve();
        }
      });
      channel.postMessage({
        type: MESSAGE_AUTH_CODE,
        nonce,
        code: authCode,
      });
    });
  } finally {
    channel.close();
    window.close();
  }
  return true;
}
