import { fetchWatchlistDeprecatedFromApi } from "../../Functions/Endpoints/Pirivate/watchlistDeprecated.js";
import {
  emitLoginError,
  emitLoginStepComplete,
  LOGIN_STEPS,
} from "../../Events/loginEvents.js";

/**
 * Fetches the deprecated watchlist from the API into Zustand.
 * Emits `LOGIN_STEPS.WATCHLIST_DATA` when done.
 */
export async function bootstrapWatchlistLoginStep() {
  try {
    await fetchWatchlistDeprecatedFromApi();
    emitLoginStepComplete(LOGIN_STEPS.WATCHLIST_DATA);
  } catch (err) {
    emitLoginError(LOGIN_STEPS.WATCHLIST_DATA, err);
    console.error(err);
  }
}
