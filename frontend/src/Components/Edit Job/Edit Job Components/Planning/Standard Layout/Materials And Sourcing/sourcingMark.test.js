import { describe, expect, it } from "vitest";

import { jobTypes } from "../../../../../../Context/defaultValues";
import { SOURCING_MARK, sourcingMark } from "./sourcingMark";

const mark = (overrides = {}) =>
  sourcingMark({
    jobType: jobTypes.manufacturing,
    hasLinked: false,
    hasPending: false,
    ...overrides,
  });

describe("the mark at the head of a row", () => {
  it("names the kind of thing the material is", () => {
    expect(mark().label).toBe("Manufacturing Job");
    expect(mark({ jobType: jobTypes.reaction }).label).toBe("Reaction Job");
    expect(mark({ jobType: jobTypes.baseMaterial }).label).toBe(
      "Base Material",
    );
  });

  it("says so when a child job is linked", () => {
    const linked = mark({ hasLinked: true });

    expect(linked.kind).toBe(SOURCING_MARK.LINKED);
    expect(linked.label).toBe("Manufacturing Job Linked");
  });

  it("tells a pending child job apart from a linked one", () => {
    const pending = mark({ hasPending: true });

    expect(pending.kind).toBe(SOURCING_MARK.PENDING);
    expect(pending.label).toBe("Manufacturing Job Pending");
  });

  it("counts a material as linked once it is, pending or not", () => {
    expect(mark({ hasLinked: true, hasPending: true }).kind).toBe(
      SOURCING_MARK.LINKED,
    );
  });

  describe("the unsettled state the old row marked amber", () => {
    it("is a buildable material with something pending and nothing linked", () => {
      expect(mark({ hasPending: true }).isUnsettled).toBe(true);
    });

    it("is not a material that is already linked", () => {
      expect(mark({ hasLinked: true, hasPending: true }).isUnsettled).toBe(
        false,
      );
    });

    it("is not a material that cannot be built at all", () => {
      // A base material with something pending against it is not waiting.
      expect(
        mark({ jobType: jobTypes.baseMaterial, hasPending: true }).isUnsettled,
      ).toBe(false);
    });
  });

  it("says when the account excludes the material from builds", () => {
    const exempt = mark({ isExempt: true });

    expect(exempt.isExempt).toBe(true);
    expect(exempt.label).toBe("Manufacturing Job — exempt from builds");
  });

  it("names a job type it does not know rather than saying undefined", () => {
    expect(mark({ jobType: 999 }).label).toBe("Material");
  });
});
