import { describe, expect, it } from "vitest";
import Job from "./job.js";
import {
  PRICING_SIDE,
  setJobPricingSide,
} from "../Functions/MarketData/pricingSide.js";

const jobWith = (layout) => new Job({ jobID: "j1", itemID: 34, layout }).build;

describe("a job's pricing override", () => {
  it("is absent on a job that has chosen nothing", () => {
    expect(jobWith({}).localPricing).toBeNull();
  });

  // A job stored before the sides were told apart names one market, which says
  // nothing about which side of the job it meant — so it seeds both.
  it("seeds both sides from a job's single market and order type", () => {
    expect(
      jobWith({ localMarketDisplay: "hek", localOrderDisplay: "buy" })
        .localPricing,
    ).toEqual({
      buying: { market: "hek", orderType: "buy" },
      selling: { market: "hek", orderType: "buy" },
    });
  });

  it("seeds from the older marketLocation key too", () => {
    expect(jobWith({ marketLocation: "amarr" }).localPricing).toEqual({
      buying: { market: "amarr", orderType: null },
      selling: { market: "amarr", orderType: null },
    });
  });

  it("keeps a stored side and seeds only the other", () => {
    expect(
      jobWith({
        localMarketDisplay: "hek",
        localOrderDisplay: "buy",
        localPricing: { selling: { market: "dodixie", orderType: "sellP05" } },
      }).localPricing,
    ).toEqual({
      buying: { market: "hek", orderType: "buy" },
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

  it("takes a second pick on a job seeded from its legacy fields", () => {
    let job = new Job({
      jobID: "j1",
      itemID: 34,
      layout: { localMarketDisplay: "amarr", localOrderDisplay: "buy" },
    });

    job = pick(job, "dodixie");
    expect(job.build.localPricing.buying.market).toBe("dodixie");
    // The other side keeps what the single legacy pair seeded it with.
    expect(job.build.localPricing.selling.market).toBe("amarr");
  });

  it("carries no override once the last choice is cleared", () => {
    let job = new Job({ jobID: "j1", itemID: 34, layout: {} });
    job = pick(job, "amarr");

    expect(pick(job, null).build.localPricing).toBeNull();
  });

  // A document saved before the fields moved still carries them under `layout`,
  // so a cleared override has to be read as a choice rather than as an absence.
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
