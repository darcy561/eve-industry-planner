import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock("../../../Functions/EveESI/World/nameLoader", () => ({
  requestName: (...args) => requestMock(...args),
}));

import { fetchNames, forgetNames, nameQuery } from "./names";
import {
  LOCATION_OUTCOME,
  LocationResolutionError,
} from "../../../Functions/EveESI/World/locationOutcome";
import { testQueryClientKeepingCache } from "../../../tests/queryClients.js";

const JITA = 60003760;
const RAITARU = 1035466617946;
const characters = [{ CharacterHash: "hash-a" }];

function client() {
  return testQueryClientKeepingCache();
}

beforeEach(() => {
  requestMock.mockReset();
});

describe("nameQuery", () => {
  it("keys on the id alone, so two callers share one entry", async () => {
    requestMock.mockResolvedValue({
      id: JITA,
      name: "Jita IV-4",
      resolutionStatus: LOCATION_OUTCOME.NAMED,
    });
    const queryClient = client();

    const [first, second] = await Promise.all([
      queryClient.fetchQuery(nameQuery(JITA, characters)),
      // A second consumer, asking with a different character list, wants the same fact.
      queryClient.fetchQuery(nameQuery(JITA, [{ CharacterHash: "hash-b" }])),
    ]);

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  // The defect the whole project exists for: a lookup that did not settle must not be remembered as
  // the answer, or the id is never asked about again for the rest of the session.
  it("caches nothing when the lookup fails", async () => {
    requestMock.mockRejectedValue(new Error("esi down"));
    const queryClient = client();

    // Retries are switched off here so the failure is one call: that the shipped config asks for
    // them is pinned below.
    await expect(
      queryClient.fetchQuery({
        ...nameQuery(JITA, characters),
        retry: false,
      }),
    ).rejects.toThrow();

    requestMock.mockResolvedValue({
      id: JITA,
      name: "Jita IV-4",
      resolutionStatus: LOCATION_OUTCOME.NAMED,
    });
    const retried = await queryClient.fetchQuery({
      ...nameQuery(JITA, characters),
      retry: false,
    });

    expect(retried.name).toBe("Jita IV-4");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a refusal, which is an answer", async () => {
    requestMock.mockResolvedValue({
      id: JITA,
      name: `No Access To Location - ${JITA}`,
      resolutionStatus: LOCATION_OUTCOME.NO_ACCESS,
    });
    const queryClient = client();

    await queryClient.fetchQuery(nameQuery(JITA, characters));
    await queryClient.fetchQuery(nameQuery(JITA, characters));

    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("asks again before giving up on a failure", () => {
    const { retry } = nameQuery(JITA, characters);
    const failure = new LocationResolutionError("universe names: 503", {
      status: 503,
    });

    expect(retry(0, failure)).toBe(true);
    expect(retry(1, failure)).toBe(true);
    expect(retry(2, failure)).toBe(false);
  });

  // A refused request is refused identically every time, and each attempt costs five times a hit
  // against ESI's error budget.
  it("does not ask again when ESI refused the request itself", () => {
    const { retry } = nameQuery(JITA, characters);
    const refused = new LocationResolutionError("universe names: 400", {
      status: 400,
      permanent: true,
    });

    expect(retry(0, refused)).toBe(false);
  });

  it("asks for nothing without an id or a character", () => {
    expect(nameQuery(0, characters).enabled).toBe(false);
    expect(nameQuery(JITA, []).enabled).toBe(false);
  });
});

describe("fetchNames", () => {
  it("answers with what was named, keyed by id", async () => {
    requestMock.mockImplementation(async (id) => ({
      id,
      name: `Place ${id}`,
      resolutionStatus: LOCATION_OUTCOME.NAMED,
    }));

    const names = await fetchNames(client(), [JITA, 60008494], characters);

    expect(names[JITA].name).toBe(`Place ${JITA}`);
    expect(names[60008494].name).toBe("Place 60008494");
  });

  // These callers resolve names as a side errand inside a flow that has other work to finish.
  it("leaves out an id that failed rather than failing the set", async () => {
    requestMock.mockImplementation(async (id) => {
      if (id === JITA) throw new Error("esi down");
      return {
        id,
        name: "Amarr VIII",
        resolutionStatus: LOCATION_OUTCOME.NAMED,
      };
    });

    const names = await fetchNames(
      { ...client(), fetchQuery: (options) => options.queryFn() },
      [JITA, 60008494],
      characters,
    );

    expect(names[JITA]).toBeUndefined();
    expect(names[60008494].name).toBe("Amarr VIII");
  });

  it("asks for nothing when there are no ids", async () => {
    await expect(fetchNames(client(), [], characters)).resolves.toEqual({});
    expect(requestMock).not.toHaveBeenCalled();
  });

  // Only a player structure needs a character's token. A station, a system, a corporation or a
  // faction is named by the bulk lookup, and waiting for characters to load would hold those back
  // for no reason.
  it("names what needs no character without one", async () => {
    requestMock.mockResolvedValue({
      id: JITA,
      name: "Jita IV-4",
      resolutionStatus: LOCATION_OUTCOME.NAMED,
    });

    await expect(fetchNames(client(), [JITA])).resolves.toEqual({
      [JITA]: expect.objectContaining({ name: "Jita IV-4" }),
    });
  });
});

// Nothing watches for a character being linked or a corporation changing yet. This is the handle
// that whatever does will reach for, so a settled refusal can stop being the account's answer.
describe("forgetNames", () => {
  it("forgets the ids it is given, and leaves the rest", async () => {
    const queryClient = client();
    requestMock.mockImplementation(async (id) => ({
      id,
      name: `Place ${id}`,
      resolutionStatus: LOCATION_OUTCOME.NAMED,
    }));
    await fetchNames(queryClient, [JITA, RAITARU], characters);
    requestMock.mockClear();

    forgetNames(queryClient, [JITA]);
    await fetchNames(queryClient, [JITA, RAITARU], characters);

    expect(requestMock.mock.calls.map(([id]) => id)).toEqual([JITA]);
  });

  it("forgets every name when given none", async () => {
    const queryClient = client();
    requestMock.mockImplementation(async (id) => ({
      id,
      name: `Place ${id}`,
      resolutionStatus: LOCATION_OUTCOME.NAMED,
    }));
    await fetchNames(queryClient, [JITA, RAITARU], characters);
    requestMock.mockClear();

    forgetNames(queryClient);
    await fetchNames(queryClient, [JITA, RAITARU], characters);

    expect(requestMock.mock.calls.map(([id]) => id).sort()).toEqual(
      [JITA, RAITARU].sort(),
    );
  });
});
