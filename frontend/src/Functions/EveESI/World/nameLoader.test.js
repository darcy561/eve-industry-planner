import { beforeEach, describe, expect, it, vi } from "vitest";

const { namesMock, structureMock, communityMock } = vi.hoisted(() => ({
  namesMock: vi.fn(),
  structureMock: vi.fn(),
  communityMock: vi.fn(),
}));

vi.mock("./getUniverseNames", () => ({
  default: (...args) => namesMock(...args),
}));

vi.mock("./getCitadelData", () => ({
  fetchStructureName: (...args) => structureMock(...args),
  communityNameOrRefusal: (...args) => communityMock(...args),
}));

import { requestName } from "./nameLoader";
import { LOCATION_OUTCOME, LocationResolutionError } from "./locationOutcome";

const JITA = 60003760;
const AMARR = 60008494;
const RAITARU = 1035466617946;
const SOTIYO = 1035466617947;

const alt = { CharacterHash: "hash-b" };
const main = { CharacterHash: "hash-a" };
const characters = [main, alt];

const named = (id, name) => ({
  id,
  name,
  resolutionStatus: LOCATION_OUTCOME.NAMED,
});

beforeEach(() => {
  namesMock.mockReset().mockResolvedValue([]);
  structureMock.mockReset();
  communityMock.mockReset();
});

describe("requestName", () => {
  it("asks for everything raised in one tick in a single call", async () => {
    namesMock.mockResolvedValue([
      named(JITA, "Jita IV-4"),
      named(AMARR, "Amarr VIII"),
    ]);

    const [jita, amarr] = await Promise.all([
      requestName(JITA, characters),
      requestName(AMARR, characters),
    ]);

    expect(namesMock).toHaveBeenCalledTimes(1);
    expect(namesMock).toHaveBeenCalledWith([JITA, AMARR]);
    expect(jita.name).toBe("Jita IV-4");
    expect(amarr.name).toBe("Amarr VIII");
  });

  it("splits a batch larger than one call into calls of a thousand", async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => 60000000 + i);
    namesMock.mockImplementation(async (batch) =>
      batch.map((id) => named(id, `Station ${id}`)),
    );

    await Promise.all(ids.map((id) => requestName(id, characters)));

    expect(namesMock).toHaveBeenCalledTimes(2);
    expect(namesMock.mock.calls[0][0]).toHaveLength(1000);
    expect(namesMock.mock.calls[1][0]).toHaveLength(500);
  });

  it("asks once when two callers want the same id in one tick", async () => {
    namesMock.mockResolvedValue([named(JITA, "Jita IV-4")]);

    const [first, second] = await Promise.all([
      requestName(JITA, characters),
      requestName(JITA, characters),
    ]);

    expect(namesMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("settles an id ESI did not mention as unnamed rather than asking forever", async () => {
    namesMock.mockResolvedValue([]);

    const outcome = await requestName(JITA, characters);

    expect(outcome.resolutionStatus).toBe(LOCATION_OUTCOME.UNNAMED);
    expect(outcome.name).toBeUndefined();
  });

  // Measured against live ESI: `POST /universe/names` is all-or-nothing. One id it cannot resolve
  // refuses the whole call with a 404 and names nothing, saying nothing about which id was at
  // fault — so without this the one bad id takes every name on the page with it, on every attempt.
  it("finds the one bad id in a batch and names the rest anyway", async () => {
    // In the station range, so it goes to the bulk lookup: an id ESI cannot resolve is only a
    // problem for the batch when it is one the batch would carry.
    const BAD = 60999999;
    namesMock.mockImplementation(async (ids) => {
      if (ids.includes(BAD)) {
        throw new LocationResolutionError("universe names: 404 Not Found", {
          status: 404,
        });
      }
      return ids.map((id) => named(id, `Place ${id}`));
    });

    const [jita, bad, amarr] = await Promise.all([
      requestName(JITA, characters),
      requestName(BAD, characters),
      requestName(AMARR, characters),
    ]);

    expect(jita.name).toBe(`Place ${JITA}`);
    expect(amarr.name).toBe(`Place ${AMARR}`);
    expect(bad.resolutionStatus).toBe(LOCATION_OUTCOME.UNNAMED);
    expect(bad.name).toBeUndefined();
  });

  // A refused batch is only worth splitting when ESI has said an id is unresolvable. Splitting on
  // anything else would turn one failed call into a cascade of them.
  it("does not split a batch that failed for any other reason", async () => {
    namesMock.mockRejectedValue(
      new LocationResolutionError("universe names: 503 Service Unavailable", {
        status: 503,
      }),
    );

    await Promise.allSettled([
      requestName(JITA, characters),
      requestName(AMARR, characters),
    ]);

    expect(namesMock).toHaveBeenCalledTimes(1);
  });

  // A moon, a stargate and a station's office folder can each arrive as something's location, and
  // `POST /universe/names` answers for none of them — it refuses the whole call, taking the ids
  // batched beside it with it. Before these were classified, they fell to the structure path and
  // cost a 403 per linked character instead.
  it.each([
    [40009077, "a planet"],
    [50001248, "a stargate"],
    [66000001, "an office folder"],
  ])("asks nothing about %i (%s), and still names the rest", async (bad) => {
    namesMock.mockResolvedValue([named(JITA, "Jita IV-4")]);

    const [jita, unnameable] = await Promise.all([
      requestName(JITA, characters),
      requestName(bad, characters),
    ]);

    expect(jita.name).toBe("Jita IV-4");
    expect(unnameable.resolutionStatus).toBe(LOCATION_OUTCOME.UNNAMED);
    expect(namesMock).toHaveBeenCalledWith([JITA]);
    expect(structureMock).not.toHaveBeenCalled();
  });

  // ESI refuses a request it will not accept — empty, holding a duplicate, or carrying a number
  // outside int32 — without looking at any id in it. That is the app having built a bad request, and
  // nothing else would say so: the ids simply fail, and the cache does not keep the failure.
  it("says so when ESI refuses the request rather than the ids", async () => {
    const refusedRequest = new LocationResolutionError("universe names: 400", {
      status: 400,
      permanent: true,
    });
    namesMock.mockRejectedValue(refusedRequest);
    const reported = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const settled = await Promise.allSettled([
      requestName(JITA, characters),
      requestName(AMARR, characters),
    ]);

    expect(reported).toHaveBeenCalledWith(
      expect.stringContaining("refused a batch of 2 outright"),
    );
    // Not split: narrowing down would settle one id as nameless over a fault that was never about
    // that id.
    expect(namesMock).toHaveBeenCalledTimes(1);
    expect(settled.every((result) => result.status === "rejected")).toBe(true);
    reported.mockRestore();
  });

  // The failure is never cached, so the next view wanting those ids asks again and lands here
  // again. Reported every time, one bad request would fill the console for the session.
  it("reports the same refused request once", async () => {
    namesMock.mockRejectedValue(
      new LocationResolutionError("universe names: 400", {
        status: 400,
        permanent: true,
      }),
    );
    const reported = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await Promise.allSettled([requestName(AMARR, characters)]);
    await Promise.allSettled([requestName(AMARR, characters)]);

    expect(reported).toHaveBeenCalledTimes(1);
    reported.mockRestore();
  });

  it("fails the ids a failed call spoke for, rather than answering with nothing", async () => {
    namesMock.mockRejectedValue(new LocationResolutionError("esi down"));

    await expect(requestName(JITA, characters)).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
  });

  it("asks the next character when one is refused", async () => {
    structureMock.mockImplementation(async (id, character) =>
      character === alt
        ? { refused: false, name: named(id, "Home Raitaru") }
        : { refused: true },
    );

    const outcome = await requestName(RAITARU, characters);

    expect(outcome.name).toBe("Home Raitaru");
    expect(communityMock).not.toHaveBeenCalled();
  });

  it("asks the community store only once every character has been refused", async () => {
    structureMock.mockResolvedValue({ refused: true });
    communityMock.mockResolvedValue({
      id: RAITARU,
      name: "Someone Else's Raitaru",
      resolutionStatus: LOCATION_OUTCOME.COMMUNITY,
    });

    const outcome = await requestName(RAITARU, characters);

    expect(structureMock).toHaveBeenCalledTimes(2);
    expect(outcome.resolutionStatus).toBe(LOCATION_OUTCOME.COMMUNITY);
  });

  // The character that failed may have been the one that could see it, so the account has not
  // established that it cannot — settling here is what made a transient failure permanent.
  it("fails rather than settling when a character could not ask at all", async () => {
    structureMock.mockImplementation(async (id, character) => {
      if (character === main) throw new LocationResolutionError("token gone");
      return { refused: true };
    });

    await expect(requestName(RAITARU, characters)).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
    expect(communityMock).not.toHaveBeenCalled();
  });

  it("batches a structure and a station together without confusing them", async () => {
    namesMock.mockResolvedValue([named(JITA, "Jita IV-4")]);
    structureMock.mockResolvedValue({
      refused: false,
      name: named(SOTIYO, "Big Sotiyo"),
    });

    const [station, structure] = await Promise.all([
      requestName(JITA, characters),
      requestName(SOTIYO, characters),
    ]);

    expect(namesMock).toHaveBeenCalledWith([JITA]);
    expect(structure.name).toBe("Big Sotiyo");
    expect(station.name).toBe("Jita IV-4");
  });

  // A market history asks for a region, which the structure endpoint answers for nobody.
  it("asks the bulk lookup for a region rather than a character's token", async () => {
    const THE_FORGE = 10000002;
    namesMock.mockResolvedValue([named(THE_FORGE, "The Forge")]);

    const outcome = await requestName(THE_FORGE, characters);

    expect(namesMock).toHaveBeenCalledWith([THE_FORGE]);
    expect(structureMock).not.toHaveBeenCalled();
    expect(outcome.name).toBe("The Forge");
  });

  // The account has established nothing about the structure if nobody was in a position to ask.
  it("does not settle as no access when no character may read structures", async () => {
    structureMock.mockImplementation(async () => {
      const err = new LocationResolutionError("token lacks the scope");
      err.needsReauthorisation = true;
      throw err;
    });

    await expect(requestName(RAITARU, characters)).rejects.toMatchObject({
      needsReauthorisation: true,
    });
    expect(communityMock).not.toHaveBeenCalled();
  });

  it("still settles on a refusal when one character could ask and was refused", async () => {
    structureMock.mockImplementation(async (id, character) => {
      if (character === main) {
        const err = new LocationResolutionError("token lacks the scope");
        err.needsReauthorisation = true;
        throw err;
      }
      return { refused: true };
    });
    communityMock.mockResolvedValue({
      id: RAITARU,
      name: "Someone Else's Raitaru",
      resolutionStatus: LOCATION_OUTCOME.COMMUNITY,
    });

    const outcome = await requestName(RAITARU, characters);

    expect(outcome.resolutionStatus).toBe(LOCATION_OUTCOME.COMMUNITY);
  });

  it("fails an id it has no character to ask with", async () => {
    await expect(requestName(RAITARU, [])).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
  });
});

describe("the character a structure is asked of first", () => {
  const asked = () =>
    structureMock.mock.calls.map(([, character]) => character);

  it("is the one the caller says has seen it", async () => {
    structureMock.mockImplementation(async (id, character) =>
      character === alt
        ? { refused: false, name: named(id, "Home Raitaru") }
        : { refused: true },
    );

    const outcome = await requestName(RAITARU, characters, ["hash-b"]);

    expect(outcome.name).toBe("Home Raitaru");
    expect(structureMock).toHaveBeenCalledTimes(1);
    expect(asked()).toEqual([alt]);
  });

  // The hint goes stale — docking rights lost, the character unlinked — and the account has not
  // established anything until everyone has been asked.
  it("does not stop the rest of the account being asked behind it", async () => {
    structureMock.mockImplementation(async (id, character) =>
      character === main
        ? { refused: false, name: named(id, "Home Raitaru") }
        : { refused: true },
    );

    const outcome = await requestName(RAITARU, characters, ["hash-b"]);

    expect(outcome.name).toBe("Home Raitaru");
    expect(asked()).toEqual([alt, main]);
  });

  // Two views wanting one structure in a tick share its lookup, so the one walk they both wait on
  // has to carry what each of them knew.
  it("is drawn from every caller waiting on the same lookup", async () => {
    structureMock.mockImplementation(async (id, character) =>
      character === alt
        ? { refused: false, name: named(id, "Home Raitaru") }
        : { refused: true },
    );

    const [first, second] = await Promise.all([
      requestName(RAITARU, characters),
      requestName(RAITARU, characters, ["hash-b"]),
    ]);

    expect(first.name).toBe("Home Raitaru");
    expect(second.name).toBe("Home Raitaru");
    expect(asked()).toEqual([alt]);
  });
});
