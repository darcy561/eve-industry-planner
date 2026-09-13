import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshStaticDataAfterAnnouncement = vi.fn();
const getAppConfig = vi.fn();

vi.mock("../../Functions/Static/staticDataSync.js", () => ({
  refreshStaticDataAfterAnnouncement: (...args) =>
    refreshStaticDataAfterAnnouncement(...args),
}));
vi.mock("../../Functions/Endpoints/Public/appConfig.js", () => ({
  getAppConfig: () => getAppConfig(),
}));

const { applyStaticDataMessage } = await import("./staticDataMessage.js");

beforeEach(() => {
  getAppConfig.mockReturnValue({ sde_build_version: "2026-09-01" });
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

  // The refresh is a network read; a malformed frame must not start one.
  it("reports a build number that is not a number", () => {
    expect(
      applyStaticDataMessage({ type: "staticData", buildNumber: "43" }),
    ).toBe(false);
    expect(refreshStaticDataAfterAnnouncement).not.toHaveBeenCalled();
  });
});
