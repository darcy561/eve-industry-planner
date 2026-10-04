import { describe, expect, it } from "vitest";

import { getSystemTypeFromBand } from "./getStructureInfo";
import Setup from "../../Classes/jobSetup";
import { jobTypes, systemTypeMap } from "../../Context/defaultValues";

describe("the band a kind of job offers for a system", () => {
  it("names the entry whose band the system is in", () => {
    for (const [band, label] of [
      ["hiSec", "High Sec"],
      ["lowSec", "Low Sec"],
      ["nullSec", "Null Sec / WH"],
    ]) {
      expect(getSystemTypeFromBand(jobTypes.manufacturing, band)?.label).toBe(
        label,
      );
    }
  });

  it("never offers an entry kept only so stored data reads", () => {
    const zarzakh = systemTypeMap[jobTypes.manufacturing][3];

    expect(zarzakh.legacy).toBe(true);
    expect(getSystemTypeFromBand(jobTypes.manufacturing, "hiSec")?.id).not.toBe(
      zarzakh.id,
    );
  });

  it("answers none where the kind has no entry for that band", () => {
    expect(getSystemTypeFromBand(jobTypes.reaction, "hiSec")).toBeNull();
  });

  it("answers none when no band is given", () => {
    expect(getSystemTypeFromBand(jobTypes.manufacturing, undefined)).toBeNull();
  });
});

describe("choosing a system brings its band with it", () => {
  const setupIn = (jobType, systemTypeID) =>
    new Setup({ jobType, systemTypeID });

  it("moves the band to the one the system is in", () => {
    const setup = setupIn(jobTypes.manufacturing, 0);

    setup.updateSystemID(30002053, "lowSec");

    expect(setup.systemID).toBe(30002053);
    expect(setup.systemTypeID).toBe(1);
  });

  it("leaves the band alone when it already matches", () => {
    const setup = setupIn(jobTypes.manufacturing, 2);

    setup.updateSystemID(30000142, "nullSec");

    expect(setup.systemTypeID).toBe(2);
  });

  it("leaves the band alone where the kind has no entry for it", () => {
    const setup = setupIn(jobTypes.reaction, 1);

    setup.updateSystemID(30000142, "hiSec");

    expect(setup.systemID).toBe(30000142);
    expect(setup.systemTypeID).toBe(1);
  });

  it("leaves the band alone when the system's band is unknown", () => {
    const setup = setupIn(jobTypes.manufacturing, 2);

    setup.updateSystemID(30000142);

    expect(setup.systemID).toBe(30000142);
    expect(setup.systemTypeID).toBe(2);
  });
});
