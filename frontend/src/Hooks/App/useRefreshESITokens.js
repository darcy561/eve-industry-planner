import { useEffect } from "react";
import GLOBAL_CONFIG from "../../global-config-app";
import useUsersStore from "../../Zustand/usersStore";

const { DEFAULT_CHARACTER_REFRESH_INTERVAL } = GLOBAL_CONFIG;

/**
 * Stagger interval (ms) for ESI token steps: `ESI_STAGGER_TARGET_FULL_CYCLE_MINUTES`
 * spread across `n` characters, clamped to min/max tick seconds. Used only by this
 * module’s `useEffect` for `setInterval` when `n` is known.
 */
function computeEsiStaggerIntervalMs(refreshableCharacterCount) {
  const n = Math.floor(Number(refreshableCharacterCount) || 0);
  if (n < 1) {
    return null;
  }
  const c = GLOBAL_CONFIG;
  const targetMin = Number(c.ESI_STAGGER_TARGET_FULL_CYCLE_MINUTES) || 10;
  const minSec = Number(c.ESI_STAGGER_TICK_MIN_SECONDS) || 20;
  const maxSec = Number(c.ESI_STAGGER_TICK_MAX_SECONDS) || 180;
  const targetSec = targetMin * 60;
  const ideal = targetSec / n;
  const clamped = Math.max(minSec, Math.min(maxSec, ideal));
  return Math.round(clamped * 1000);
}

function selectRefreshableCharacterCount(state) {
  if (!state.account.isLoggedIn) return 0;
  return state.account.characters.filter(
    (c) =>
      c &&
      !c.isPlaceholder &&
      typeof c.refreshESIToken === "function"
  ).length;
}

/**
 * App-level: staggered ESI refresh (one character per tick) with a dynamic tick
 * from roster size, plus 15m corporation-claims + app JWT maintenance (login-gated
 * only; that interval does not reset when the roster changes).
 */
function useRefreshESITokens() {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const characterCount = useUsersStore(selectRefreshableCharacterCount);

  useEffect(() => {
    if (!isLoggedIn) {
      return undefined;
    }
    const maintenanceMs = DEFAULT_CHARACTER_REFRESH_INTERVAL * 60 * 1000;
    const { runEsiTokenIntervalMaintenance } =
      useUsersStore.getState().account.actions;

    const maintenanceId = setInterval(() => {
      void runEsiTokenIntervalMaintenance();
    }, maintenanceMs);

    return () => {
      clearInterval(maintenanceId);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (characterCount < 1) {
      return undefined;
    }
    const staggerMs = computeEsiStaggerIntervalMs(characterCount);
    if (staggerMs == null || staggerMs <= 0) {
      return undefined;
    }

    const { runStaggeredEsiTokenStep } = useUsersStore.getState().account.actions;

    void runStaggeredEsiTokenStep();

    const staggerId = setInterval(() => {
      void runStaggeredEsiTokenStep();
    }, staggerMs);

    return () => {
      clearInterval(staggerId);
    };
  }, [characterCount]);
}

export default useRefreshESITokens;
