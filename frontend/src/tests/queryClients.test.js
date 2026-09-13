import { describe, expect, it } from "vitest";
import {
  testQueryClient,
  testQueryClientCollapsingRetries,
  testQueryClientKeepingCache,
} from "./queryClients.js";

async function attemptsUnder(client, queryOptions = {}) {
  let attempts = 0;
  await client
    .fetchQuery({
      queryKey: ["probe", Math.random()],
      queryFn: () => {
        attempts += 1;
        throw new Error("nope");
      },
      ...queryOptions,
    })
    .catch(() => {});
  return attempts;
}

describe("testQueryClient", () => {
  it("does not retry a failing query", async () => {
    expect(await attemptsUnder(testQueryClient())).toBe(1);
  });
});

describe("testQueryClientCollapsingRetries", () => {
  // Why this client exists at all. A `retry` on the query outlives the client
  // default, so `retry: false` cannot switch these off and a test using the
  // plain client would sit through the real schedule.
  it("keeps the attempts a query asks for", async () => {
    const attempts = await attemptsUnder(testQueryClientCollapsingRetries(), {
      retry: 2,
    });

    expect(attempts).toBe(3);
  });

  it("and the plain client cannot prevent them", async () => {
    const attempts = await attemptsUnder(testQueryClient(), { retry: 2 });

    expect(attempts).toBe(3);
  });
});

describe("testQueryClientKeepingCache", () => {
  it("holds a seeded entry with nothing observing it", () => {
    const client = testQueryClientKeepingCache();
    client.setQueryData(["name", 34], "Tritanium");

    expect(client.getQueryData(["name", 34])).toBe("Tritanium");
    expect(client.getDefaultOptions().queries.gcTime).toBe(Infinity);
  });
});
