import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../Functions/Shared/findBlueprintType", () => ({
  default: () => "Manufacturing",
}));

const { availableRunRows, linkedRunRows } = await import("./runRows.js");

const NOW = Date.parse("2026-06-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const BUILDER = {
  CharacterID: 900,
  CharacterName: "Builder",
  CharacterHash: "b",
};

const context = {
  characterById: (id) => (id === BUILDER.CharacterID ? BUILDER : null),
  characterByHash: (hash) => (hash === BUILDER.CharacterHash ? BUILDER : null),
  facilityNames: { 60003760: { name: "Jita IV - Moon 4" } },
  queryClient: {},
  now: NOW,
};

function offered(overrides = {}) {
  return {
    job_id: 1,
    installer_id: BUILDER.CharacterID,
    facility_id: 60003760,
    status: "active",
    runs: 3,
    start_date: new Date(NOW - HOUR).toISOString(),
    end_date: new Date(NOW + HOUR).toISOString(),
    ...overrides,
  };
}

function stored(overrides = {}) {
  return {
    job_id: 1,
    CharacterHash: BUILDER.CharacterHash,
    station_id: 60003760,
    status: "active",
    runs: 3,
    cost: 1500,
    start_date: new Date(NOW - HOUR).toISOString(),
    end_date: new Date(NOW + HOUR).toISOString(),
    ...overrides,
  };
}

describe("the rows a run is drawn from", () => {
  it("names the character who installed an offered run and where it is running", () => {
    const [row] = availableRunRows([offered()], context);

    expect(row.owner).toBe(BUILDER);
    expect(row.facilityName).toBe("Jita IV - Moon 4");
    expect(row.installCost).toBeNull();
    expect(row.progress).toBe(50);
  });

  // The defect: the slot arithmetic counted every match while the list drew
  // only the ones it could name, so an unnameable run withheld an offer that
  // the drawn rows would have fitted into.
  it("leaves out an offered run this account cannot name", () => {
    const rows = availableRunRows(
      [offered(), offered({ job_id: 2, installer_id: 7 })],
      context,
    );

    expect(rows.map(({ run }) => run.job_id)).toEqual([1]);
  });

  it("keeps a stored run whose character can no longer be named", () => {
    const [row] = linkedRunRows([stored({ CharacterHash: "gone" })], context);

    expect(row.owner).toBeNull();
    expect(row.run.job_id).toBe(1);
  });

  it("says what a stored run cost to install, which an offered one has not", () => {
    const [linked] = linkedRunRows([stored()], context);
    const [available] = availableRunRows([offered()], context);

    expect(linked.installCost).toBe(1500);
    expect(available.installCost).toBeNull();
  });

  it("falls back to the unnamed label where the place could not be resolved", () => {
    const [row] = linkedRunRows([stored({ station_id: 123 })], context);

    expect(row.facilityName).toBe("Unknown Location");
  });

  // One vocabulary for both lists: the same run reads the same way whether the
  // job holds it or ESI is offering it.
  it.each([
    ["active", "Active", "warning"],
    ["delivered", "Delivered", "success"],
    ["cancelled", "Cancelled", "error"],
  ])("draws a %s run as %s", (status, label, colour) => {
    const [available] = availableRunRows([offered({ status })], context);
    const [linked] = linkedRunRows([stored({ status })], context);

    expect(available.statusLabel).toBe(label);
    expect(available.statusColour).toBe(colour);
    expect(linked.statusLabel).toBe(label);
    expect(linked.statusColour).toBe(colour);
  });

  it("draws a run past its end date as waiting to be collected", () => {
    const past = { end_date: new Date(NOW - HOUR).toISOString() };
    const [available] = availableRunRows([offered(past)], context);
    const [linked] = linkedRunRows([stored(past)], context);

    expect(available.statusLabel).toBe("Ready for Delivery");
    expect(available.statusColour).toBe("info");
    expect(linked.statusColour).toBe("info");
  });

  it("counts down only while a run is still running", () => {
    const [running] = availableRunRows([offered()], context);
    const [delivered] = availableRunRows(
      [offered({ status: "delivered" })],
      context,
    );

    expect(running.timeRemaining).not.toBeNull();
    expect(delivered.timeRemaining).toBeNull();
  });
});
