import { beforeEach, describe, expect, test, vi } from "vitest";

const setMaintenanceMode = vi.fn();
vi.mock("../../Functions/Endpoints/Public/appConfig.js", () => ({
  setMaintenanceMode: (...args) => setMaintenanceMode(...args),
}));

const { applyMaintenanceMessage } = await import("./maintenanceMessage.js");
const { applyRemoteMessage } = await import("../applyRemoteMessage.js");

describe("maintenance message", () => {
  beforeEach(() => {
    setMaintenanceMode.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  test("applies the pushed state without a fetch", () => {
    expect(
      applyMaintenanceMessage({ type: "maintenance", enabled: true }),
    ).toBe(true);
    expect(setMaintenanceMode).toHaveBeenCalledWith(true);
  });

  test("a message without enabled is rejected, not applied", () => {
    expect(applyMaintenanceMessage({ type: "maintenance" })).toBe(false);
    expect(
      applyMaintenanceMessage({ type: "maintenance", enabled: "yes" }),
    ).toBe(false);
    expect(setMaintenanceMode).not.toHaveBeenCalled();
  });

  test("the router sends the family here", async () => {
    await applyRemoteMessage({
      type: "maintenance",
      enabled: true,
      message: "x",
    });
    expect(setMaintenanceMode).toHaveBeenCalledWith(true);
  });
});
