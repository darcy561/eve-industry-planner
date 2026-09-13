import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshStaticDataAfterAnnouncement = vi.fn();
const getAppConfig = vi.fn();
const heldStaticDataBuildVersion = vi.fn();

vi.mock("../../Functions/Static/staticDataSync.js", () => ({
  refreshStaticDataAfterAnnouncement: (...args) =>
    refreshStaticDataAfterAnnouncement(...args),
}));
vi.mock("../../Functions/Endpoints/Public/appConfig.js", () => ({
  getAppConfig: () => getAppConfig(),
}));
vi.mock("../../Functions/Helper/getCachedData.js", () => ({
  heldStaticDataBuildVersion: () => heldStaticDataBuildVersion(),
}));

const { applyStaticDataMessage } = await import("./staticDataMessage.js");

beforeEach(() => {
  getAppConfig.mockReturnValue({ sde_build_version: "2026-09-01" });
  // Nothing refreshed yet, so app-config is all the page has.
  heldStaticDataBuildVersion.mockReturnValue(null);
});

describe("a static data announcement", () => {
  it("reads the files again when the build has moved", () => {
    expect(
      applyStaticDataMessage({
        type: "staticData",
        buildNumber: 43,
        version: "2026-09-13",
      }),
    ).toBe(true);

    expect(refreshStaticDataAfterAnnouncement).toHaveBeenCalled();
  });

  it("does nothing for the build already held", () => {
    expect(
      applyStaticDataMessage({
        type: "staticData",
        buildNumber: 42,
        version: "2026-09-01",
      }),
    ).toBe(true);

    expect(refreshStaticDataAfterAnnouncement).not.toHaveBeenCalled();
  });

  it("reads again when the page loaded without knowing a build", () => {
    getAppConfig.mockReturnValue({ sde_build_version: "" });

    applyStaticDataMessage({ type: "staticData", version: "2026-09-13" });

    expect(refreshStaticDataAfterAnnouncement).toHaveBeenCalled();
  });

  it("acts on a build number alone, since the version is optional", () => {
    expect(
      applyStaticDataMessage({ type: "staticData", buildNumber: 43 }),
    ).toBe(true);

    expect(refreshStaticDataAfterAnnouncement).toHaveBeenCalled();
  });

  it("reports a message naming no build at all", () => {
    expect(applyStaticDataMessage({ type: "staticData" })).toBe(false);
    expect(refreshStaticDataAfterAnnouncement).not.toHaveBeenCalled();
  });

  // app-config reports the build the server held when it was last fetched. Once
  // this page has refreshed, that is no longer what it holds, and comparing
  // against it would download the same files on every announcement after the
  // first.
  it("compares against what the page holds, not what it loaded with", () => {
    heldStaticDataBuildVersion.mockReturnValue("2026-09-13");

    applyStaticDataMessage({ type: "staticData", version: "2026-09-13" });

    expect(refreshStaticDataAfterAnnouncement).not.toHaveBeenCalled();
  });

  it("still acts on a build newer than the one held", () => {
    heldStaticDataBuildVersion.mockReturnValue("2026-09-13");

    applyStaticDataMessage({ type: "staticData", version: "2026-09-20" });

    expect(refreshStaticDataAfterAnnouncement).toHaveBeenCalled();
  });

  // The refresh is a network read; a malformed frame must not start one.
  it("reports a build number that is not a number", () => {
    expect(
      applyStaticDataMessage({ type: "staticData", buildNumber: "43" }),
    ).toBe(false);
    expect(refreshStaticDataAfterAnnouncement).not.toHaveBeenCalled();
  });
});
