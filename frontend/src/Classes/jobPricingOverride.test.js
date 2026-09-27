import { describe, expect, it } from "vitest";
import {
  jobFromDocument,
  toDocument,
} from "../Functions/JobDocuments/jobDocument";
import {
  PRICING_SIDE,
  setJobPricingSide,
} from "../Functions/MarketData/defaults/pricingSide";

const jobWith = (layout) =>
  jobFromDocument({ jobID: "j1", itemID: 34, layout }).build;

describe("a job's pricing override", () => {
  it("is absent on a job that has chosen nothing", () => {
    expect(jobWith({}).localPricing).toBeNull();
  });

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

  const pick = (job, market) =>
    jobFromDocument({
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
    let job = jobFromDocument({ jobID: "j1", itemID: 34, layout: {} });

    job = pick(job, "amarr");
    expect(job.build.localPricing.buying.market).toBe("amarr");

    job = pick(job, "dodixie");
    expect(job.build.localPricing.buying.market).toBe("dodixie");
  });

  it("takes a second pick on a job that already priced a side", () => {
    let job = jobFromDocument({
      jobID: "j1",
      itemID: 34,
      layout: {
        localPricing: { buying: { market: "amarr", orderType: "buy" } },
      },
    });

    job = pick(job, "dodixie");
    expect(job.build.localPricing.buying.market).toBe("dodixie");
    expect(job.build.localPricing.selling.market).toBeNull();
  });

  it("carries no override once the last choice is cleared", () => {
    let job = jobFromDocument({ jobID: "j1", itemID: 34, layout: {} });
    job = pick(job, "amarr");

    expect(pick(job, null).build.localPricing).toBeNull();
  });

  it("keeps a cleared override cleared against a stale layout", () => {
    const job = jobFromDocument({
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
    const job = jobFromDocument({
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
    const stored = toDocument(
      jobFromDocument({
        jobID: "j1",
        itemID: 34,
        layout: {
          localPricing: { buying: { market: "hek", orderType: "buyP95" } },
        },
      }),
    );

    expect(jobFromDocument(stored).build.localPricing.buying).toEqual({
      market: "hek",
      orderType: "buyP95",
    });
  });
});
