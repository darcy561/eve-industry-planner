import { beforeEach, describe, expect, it, vi } from "vitest";

const { account, fetchMock, tokenMock, communityMock, submissions } =
  vi.hoisted(() => ({
    account: { shareCitadelNames: true },
    fetchMock: vi.fn(),
    tokenMock: vi.fn(),
    communityMock: vi.fn(),
    submissions: [],
  }));

vi.mock("../fetchWithCustomHeaders", () => ({
  default: (...args) => fetchMock(...args),
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

vi.mock("./communityNames", () => ({
  submitStructureName: (id, esi) => submissions.push({ id, name: esi.name }),
  communityName: (...args) => communityMock(...args),
}));

vi.mock("../../Auth/esiCredentials/provider.js", () => ({
  getEsiAccessToken: (...args) => tokenMock(...args),
}));

/** A token carrying exactly the scopes named. */
function tokenWith(scopes) {
  const payload = btoa(JSON.stringify({ scp: scopes }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `header.${payload}.signature`;
}

import { fetchStructureName, communityNameOrRefusal } from "./getCitadelData";
import { LocationResolutionError } from "./locationOutcome";
import { LOCATION_RESOLUTION_STATUS } from "../../Assets/assetLocationConstants";

const RAITARU = 1035466617946;
const character = { CharacterHash: "hash-a" };

function esiResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  };
}

beforeEach(() => {
  account.shareCitadelNames = true;
  fetchMock.mockReset();
  tokenMock.mockReset().mockResolvedValue({ accessToken: "token" });
  communityMock.mockReset().mockResolvedValue(null);
  submissions.length = 0;
});

describe("fetchStructureName", () => {
  it("names a structure the character can see", async () => {
    fetchMock.mockResolvedValue(esiResponse(200, { name: "Home Raitaru" }));

    const answer = await fetchStructureName(RAITARU, character);

    expect(answer.refused).toBe(false);
    expect(answer.name.name).toBe("Home Raitaru");
    expect(answer.name.resolutionStatus).toBe(
      LOCATION_RESOLUTION_STATUS.RESOLVED,
    );
    expect(submissions).toHaveLength(1);
  });

  // A refusal is this character's answer, not the account's: docking access is per character and
  // nothing here knows which character holds it, so the fallback is the caller's to reach for once
  // every character has been asked.
  it("reports a refusal without reaching for the community store", async () => {
    fetchMock.mockResolvedValue(esiResponse(403, null));

    const answer = await fetchStructureName(RAITARU, character);

    expect(answer.refused).toBe(true);
    expect(communityMock).not.toHaveBeenCalled();
  });

  // The defect this stage exists for: a structure the account can dock at showed as inaccessible
  // for the rest of the session because ESI was briefly unwell.
  it.each([500, 502, 503, 420])(
    "throws rather than settling when ESI answers %i",
    async (status) => {
      fetchMock.mockResolvedValue(esiResponse(status, null));

      await expect(
        fetchStructureName(RAITARU, character),
      ).rejects.toBeInstanceOf(LocationResolutionError);
    },
  );

  it("throws when the token cannot be acquired", async () => {
    tokenMock.mockRejectedValue(new Error("refresh failed"));

    await expect(fetchStructureName(RAITARU, character)).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A token issued before the app asked for structure access can never answer, and asking anyway
  // spends a 403 to learn what the token already says — at five times a hit's cost against ESI's
  // error budget, and coming back indistinguishable from a docking refusal.
  it("does not ask at all when the token was never granted the scope", async () => {
    tokenMock.mockResolvedValue({
      accessToken: tokenWith(["esi-assets.read_assets.v1"]),
    });

    await expect(fetchStructureName(RAITARU, character)).rejects.toMatchObject({
      needsReauthorisation: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks when the token carries the scope", async () => {
    tokenMock.mockResolvedValue({
      accessToken: tokenWith(["esi-universe.read_structures.v1"]),
    });
    fetchMock.mockResolvedValue(esiResponse(200, { name: "Home Raitaru" }));

    const answer = await fetchStructureName(RAITARU, character);

    expect(answer.name.name).toBe("Home Raitaru");
  });

  it("throws when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(fetchStructureName(RAITARU, character)).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
  });
});

describe("communityNameOrRefusal", () => {
  it("takes the community name when there is one", async () => {
    communityMock.mockResolvedValue({ name: "Someone Else's Raitaru" });

    const outcome = await communityNameOrRefusal(RAITARU);

    expect(outcome.name).toBe("Someone Else's Raitaru");
    expect(outcome.resolutionStatus).toBe(LOCATION_RESOLUTION_STATUS.COMMUNITY);
  });

  it("settles as no access when the community store has nothing", async () => {
    const outcome = await communityNameOrRefusal(RAITARU);

    expect(outcome.resolutionStatus).toBe(LOCATION_RESOLUTION_STATUS.NO_ACCESS);
  });

  it("does not ask the community store when the account has opted out", async () => {
    account.shareCitadelNames = false;

    const outcome = await communityNameOrRefusal(RAITARU);

    expect(communityMock).not.toHaveBeenCalled();
    expect(outcome.resolutionStatus).toBe(LOCATION_RESOLUTION_STATUS.NO_ACCESS);
  });
});
