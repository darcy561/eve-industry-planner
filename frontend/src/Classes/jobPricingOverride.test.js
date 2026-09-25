import { describe, expect, it } from "vitest";
import Job from "./job.js";
import {
  PRICING_SIDE,
  setJobPricingSide,
} from "../Functions/MarketData/defaults/pricingSide";

const jobWith = (layout) => new Job({ jobID: "j1", itemID: 34, layout }).build;

describe("a job's pricing override", () => {
  it("is absent on a job that has chosen nothing", () => {
    expect(jobWith({}).localPricing).toBeNull();
  });

  // A job prices one side and leaves the other to the account's defaults, so the
  // side it said nothing about must stay empty rather than copy the one it chose.
  it("keeps the side it chose and leaves the other empty", () => {
    expect(
      jobWith({
        localPricing: { selling: { market: "dodixie", orderType: "sellP05" } },
      }).localPricing,
    ).toEqual({
      buying: { market: null, orderType: null },
      selling: { market: "dodixie", orderType: "sellP05" },
    });
  });

  // The reducer rebuilds the job from the previous instance on every pricing
  // edit, so a pick that only won on the first construction would leave the
  // selector dead for the rest of the session.
  const pick = (job, market) =>
    new Job({
      ...job,
      build: {
        ...job.build,
        localPricing: setJobPricingSide(
          job.build.localPricing,
          PRICING_SIDE.BUYING,
          "market",
          market,
        ),
      },
    });

  it("takes a second pick on a job that had none", () => {
    let job = new Job({ jobID: "j1", itemID: 34, layout: {} });

    job = pick(job, "amarr");
    expect(job.build.localPricing.buying.market).toBe("amarr");

    job = pick(job, "dodixie");
    expect(job.build.localPricing.buying.market).toBe("dodixie");
  });

  it("takes a second pick on a job that already priced a side", () => {
    let job = new Job({
      jobID: "j1",
      itemID: 34,
      layout: {
        localPricing: { buying: { market: "amarr", orderType: "buy" } },
      },
    });

    job = pick(job, "dodixie");
    expect(job.build.localPricing.buying.market).toBe("dodixie");
    // The side it never priced is still the account's to answer.
    expect(job.build.localPricing.selling.market).toBeNull();
  });

  it("carries no override once the last choice is cleared", () => {
    let job = new Job({ jobID: "j1", itemID: 34, layout: {} });
    job = pick(job, "amarr");

    expect(pick(job, null).build.localPricing).toBeNull();
  });

  // A document saved before the fields moved still carries them under `layout`,
  // so a cleared override has to be read as a choice rather than as an absence.
  // `build` wins wherever it says anything at all, including null.
  it("keeps a cleared override cleared against a stale layout", () => {
    const job = new Job({
      jobID: "j1",
      itemID: 34,
      build: { localPricing: null, materialPriceOverrides: {} },
      layout: {
        localPricing: { buying: { market: "jita", orderType: "sell" } },
        materialPriceOverrides: { 34: { marketDisplay: "amarr" } },
      },
    });

    expect(job.build.localPricing).toBeNull();
    expect(job.build.materialPriceOverrides).toEqual({});
  });

  it("reads a document that only carries the fields under layout", () => {
    const job = new Job({
      jobID: "j1",
      itemID: 34,
      layout: {
        localPricing: { buying: { market: "jita", orderType: "sell" } },
        materialPriceOverrides: { 34: { marketDisplay: "amarr" } },
      },
    });

    expect(job.build.localPricing.buying.market).toBe("jita");
    expect(job.build.materialPriceOverrides["34"]).toEqual({
      marketDisplay: "amarr",
    });
  });

  it("survives a round trip through the stored document", () => {
    const stored = new Job({
      jobID: "j1",
      itemID: 34,
      layout: {
        localPricing: { buying: { market: "hek", orderType: "buyP95" } },
      },
    }).toDocument();

    expect(new Job(stored).build.localPricing.buying).toEqual({
      market: "hek",
      orderType: "buyP95",
    });
  });
});
