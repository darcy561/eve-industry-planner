import { useEffect } from "react";
import { revalidateSourceClocks } from "../../Functions/MarketData/priceCache";

/**
 * How often to ask the markets holding rows whether their books have moved.
 *
 * The server's scheduler ticks every fifteen minutes and publishes only the
 * regions ESI says can have changed, so a shorter interval cannot see anything
 * that has not been published and a longer one leaves a reader on figures the
 * server has already replaced.
 *
 * This paces the asking. It is not a staleness rule — what decides whether a row
 * survives is its market's own clock, and a row whose market has not been walked
 * again outlives any number of these ticks untouched.
 */
const PROBE_INTERVAL = 15 * 60 * 1000;

/**
 * Keeps held prices in step with the markets they came from.
 *
 * An effect because this synchronises with something outside React: a clock the
 * server moves on its own schedule. Mount it once, at the top of the app — the
 * price cache is shared, so a second caller would ask twice for one answer.
 */
export default function useMarketClockRevalidation() {
  useEffect(() => {
    const tick = () => {
      // A failed probe is left alone: the rows held stay held, and the next
      // tick asks again. Nothing is shown differently for a probe that did not
      // land, because a row's market not answering says nothing about the row.
      revalidateSourceClocks().catch(() => {});
    };

    const timer = setInterval(tick, PROBE_INTERVAL);

    // Coming back to a tab left open is the case a timer alone handles worst:
    // a background tab's intervals are throttled, so the reader returns to
    // whatever the clock said when it last fired.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
