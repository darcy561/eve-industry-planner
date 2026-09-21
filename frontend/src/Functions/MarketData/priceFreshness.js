/**
 * When a price stops standing, and the one answer to what an absent expiry
 * means.
 *
 * A price carries two moments: `refreshedAt`, the moment the orders it was
 * derived from were current, and `expiresAt`, the moment it stops being worth
 * reading. Four places act on the second — the device refusing a stored row, the
 * sweep retiring a held one, the rotation deciding a market is due, and the read
 * stamping both onto what it keeps — and they were four rules, two of which
 * disagreed about a row carrying no expiry at all.
 */

/**
 * Whether a price with this expiry has stopped standing.
 *
 * **No expiry means it stands.** A price is kept because something said it was
 * good, and nothing saying when it stops is not the same as it having stopped —
 * treating it as lapsed would re-read a market on every pass for want of a
 * header. What is bounded elsewhere: the markets this server prices state a
 * clock instead, and a market the reader reads themselves is always stamped with
 * its own turn by {@link withFreshness}.
 *
 * @param {number|undefined} expiresAt
 * @param {number} now
 * @returns {boolean}
 */
export function hasLapsed(expiresAt, now) {
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

/**
 * A row carrying the moments it was read against.
 *
 * One spread, so what reaches the device and what reaches the cache cannot
 * disagree about which values count as an expiry.
 *
 * @template {object} T
 * @param {T} row
 * @param {{refreshedAt: number, expiresAt?: number}} freshness
 * @returns {T & {refreshedAt: number, expiresAt?: number}}
 */
export function withFreshness(row, freshness) {
  return {
    ...row,
    refreshedAt: freshness.refreshedAt,
    ...(Number.isFinite(freshness.expiresAt)
      ? { expiresAt: freshness.expiresAt }
      : {}),
  };
}
