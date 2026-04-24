/**
 * Legacy hook: job groups were re-subscribed after persist; account-scoped realtime
 * delivers all tenant documents without per-doc subscribe. Kept as a no-op so
 * call sites can stay async-friendly during migration.
 */
export async function syncJobGroupWebSocketSubscriptions() {
  /* no-op — server uses JWT account scope */
}
