import { beforeEach, describe, expect, it } from "vitest";
import { createEsiCredentialProvider } from "./provider.js";
import {
  CREDENTIAL_HEALTH,
  credentialHealth,
  resetCredentialHealth,
} from "./health.js";
import {
  ESI_CREDENTIAL_REAUTH_REQUIRED,
  ESI_CREDENTIAL_RECOVERABLE,
  EsiCredentialError,
  isReauthRequired,
} from "./errors.js";

const HASH = "owner-hash";

/** A strategy whose refreshes are countable and whose resolution the test controls. */
function countingStrategy(exp, { fail } = {}) {
  const strategy = {
    calls: 0,
    async refresh() {
      strategy.calls += 1;
      if (fail) throw fail;
      return { accessToken: `token-${strategy.calls}`, exp };
    },
  };
  return strategy;
}

function providerFor(strategy, nowSec = 1_000) {
  return createEsiCredentialProvider({
    strategy: () => strategy,
    now: () => nowSec,
  });
}

describe("esi credential provider", () => {
  beforeEach(() => {
    resetCredentialHealth();
  });

  it("returns the held token without refreshing when it is well inside the buffer", async () => {
    const strategy = countingStrategy(5_000);
    const provider = providerFor(strategy);

    const first = await provider.getEsiAccessToken(HASH);
    const second = await provider.getEsiAccessToken(HASH);

    expect(strategy.calls).toBe(1);
    expect(second.accessToken).toBe(first.accessToken);
  });

  it("refreshes when the held token is inside the buffer", async () => {
    // exp 1200 with now 1000 leaves 200s — less than the 660s buffer.
    const strategy = countingStrategy(1_200);
    const provider = providerFor(strategy);

    await provider.getEsiAccessToken(HASH);
    await provider.getEsiAccessToken(HASH);

    expect(strategy.calls).toBe(2);
  });

  // Several hooks for one character mount together; without single-flight each would start its own
  // OAuth refresh, and for the local strategy each would spend the same rotating refresh secret.
  it("gives concurrent callers one refresh and one result", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const strategy = {
      calls: 0,
      async refresh() {
        strategy.calls += 1;
        await gate;
        return { accessToken: "token", exp: 5_000 };
      },
    };
    const provider = providerFor(strategy);

    const all = Promise.all([
      provider.getEsiAccessToken(HASH),
      provider.getEsiAccessToken(HASH),
      provider.getEsiAccessToken(HASH),
    ]);
    release();
    const results = await all;

    expect(strategy.calls).toBe(1);
    expect(results.map((r) => r.accessToken)).toEqual([
      "token",
      "token",
      "token",
    ]);
  });

  it("refreshes each character separately", async () => {
    const strategy = countingStrategy(5_000);
    const provider = providerFor(strategy);

    await provider.getEsiAccessToken("one");
    await provider.getEsiAccessToken("two");

    expect(strategy.calls).toBe(2);
  });

  it("retries after a failure rather than caching it", async () => {
    const failing = countingStrategy(5_000, {
      fail: new EsiCredentialError("boom", ESI_CREDENTIAL_RECOVERABLE),
    });
    const provider = providerFor(failing);

    await expect(provider.getEsiAccessToken(HASH)).rejects.toThrow("boom");
    await expect(provider.getEsiAccessToken(HASH)).rejects.toThrow("boom");
    expect(failing.calls).toBe(2);
  });

  it("propagates the failure classification to the caller", async () => {
    const provider = providerFor(
      countingStrategy(5_000, {
        fail: new EsiCredentialError("dead", ESI_CREDENTIAL_REAUTH_REQUIRED),
      }),
    );

    await expect(provider.getEsiAccessToken(HASH)).rejects.toMatchObject({
      classification: ESI_CREDENTIAL_REAUTH_REQUIRED,
    });
  });

  it("rejects a missing character hash without calling the strategy", async () => {
    const strategy = countingStrategy(5_000);
    const provider = providerFor(strategy);

    await expect(provider.getEsiAccessToken("")).rejects.toBeInstanceOf(
      EsiCredentialError,
    );
    expect(strategy.calls).toBe(0);
  });

  it("forgets a character's token", async () => {
    const strategy = countingStrategy(5_000);
    const provider = providerFor(strategy);

    await provider.getEsiAccessToken(HASH);
    provider.forget(HASH);
    await provider.getEsiAccessToken(HASH);

    expect(strategy.calls).toBe(2);
  });

  it("ignores an adoption with no hash or no token", async () => {
    const strategy = countingStrategy(5_000);
    const provider = providerFor(strategy);

    provider.adoptEsiAccessToken("", "token");
    provider.adoptEsiAccessToken(HASH, "");
    provider.adoptEsiAccessToken(HASH, "   ");

    expect(provider.heldEsiAccessToken(HASH)).toBe("");
  });

  it("reports only reauth-required credential errors as terminal", () => {
    expect(
      isReauthRequired(
        new EsiCredentialError("x", ESI_CREDENTIAL_REAUTH_REQUIRED),
      ),
    ).toBe(true);
    expect(
      isReauthRequired(new EsiCredentialError("x", ESI_CREDENTIAL_RECOVERABLE)),
    ).toBe(false);
    expect(isReauthRequired(new Error("a plain failure"))).toBe(false);
    expect(isReauthRequired(undefined)).toBe(false);
  });

  it("peeks without acquiring", async () => {
    const strategy = countingStrategy(5_000);
    const provider = providerFor(strategy);

    expect(provider.heldEsiAccessToken(HASH)).toBe("");
    await provider.getEsiAccessToken(HASH);
    expect(provider.heldEsiAccessToken(HASH)).toBe("token-1");
    expect(strategy.calls).toBe(1);
  });

  it("records what each acquisition found about the character's credentials", async () => {
    const provider = providerFor(countingStrategy(5_000));

    await provider.getEsiAccessToken(HASH);

    expect(credentialHealth(HASH).state).toBe(CREDENTIAL_HEALTH.OK);
  });

  it("separates a spent refresh secret from a failure that may pass", async () => {
    const spent = providerFor(
      countingStrategy(5_000, {
        fail: new EsiCredentialError("gone", ESI_CREDENTIAL_REAUTH_REQUIRED),
      }),
    );
    const faulty = providerFor(
      countingStrategy(5_000, {
        fail: new EsiCredentialError("later", ESI_CREDENTIAL_RECOVERABLE),
      }),
    );

    await expect(spent.getEsiAccessToken(HASH)).rejects.toThrow();
    await expect(faulty.getEsiAccessToken("other")).rejects.toThrow();

    expect(credentialHealth(HASH).state).toBe(
      CREDENTIAL_HEALTH.REAUTH_REQUIRED,
    );
    expect(credentialHealth("other").state).toBe(CREDENTIAL_HEALTH.DEGRADED);
  });

  it("acquires again for a reader asking to renew, token in hand or not", async () => {
    const strategy = countingStrategy(5_000);
    const provider = providerFor(strategy);

    await provider.getEsiAccessToken(HASH);
    const renewed = await provider.reacquireEsiAccessToken(HASH);

    expect(strategy.calls).toBe(2);
    expect(renewed.accessToken).toBe("token-2");
  });

  it("forgets what it knew about a forgotten character's credentials", async () => {
    const provider = providerFor(countingStrategy(5_000));

    await provider.getEsiAccessToken(HASH);
    provider.forget(HASH);

    expect(credentialHealth(HASH).state).toBe(CREDENTIAL_HEALTH.UNKNOWN);
  });
});
