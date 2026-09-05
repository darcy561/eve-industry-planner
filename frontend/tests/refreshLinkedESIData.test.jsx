import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const characterOrders = { data: {}, isLoading: false };
const corporationOrders = { data: {}, isLoading: false };
const industryJobs = { data: [], isLoading: false };

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: () => null,
}));
vi.mock(
  "../src/Hooks/EveEsi/Character/useGetAllCharacterMarketOrders",
  () => ({ getAllCachedCharacterMarketOrders: () => characterOrders }),
);
vi.mock(
  "../src/Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders",
  () => ({ getAllCachedCorporationMarketOrders: () => corporationOrders }),
);
vi.mock("../src/Hooks/EveEsi/useGetAllIndustryJobs", () => ({
  getCachedAllIndustryJobs: () => industryJobs,
}));
vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", characters: [], isLoggedIn: false },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));

const { useRefreshLinkedESIData } = await import(
  "../src/Components/Edit Job/Hooks/useRefreshLinkedESIData.js"
);
const { default: Job } = await import("../src/Classes/job.js");

function jobWithOrder(overrides = {}) {
  return new Job({
    jobID: "job-1",
    itemID: 34,
    jobType: 1,
    name: "Tritanium",
    build: {
      sale: {
        marketOrders: [
          {
            order_id: 900,
            item_price: 5,
            volume_total: 100,
            volume_remain: 40,
            issued: "2026-08-01T00:00:00Z",
            state: "open",
            timeStamps: ["2026-08-01T00:00:00Z"],
            ...overrides,
          },
        ],
      },
    },
  });
}

function openJob(job) {
  const updateActiveJob = vi.fn();
  function Editor() {
    useRefreshLinkedESIData(job, updateActiveJob);
    return null;
  }
  render(<Editor />);
  return updateActiveJob;
}

describe("opening a job refreshes what ESI last said", () => {
  it("takes the latest volume and price without visiting the selling tab", () => {
    const job = jobWithOrder();
    characterOrders.data = {
      "hash-1": [
        {
          order_id: 900,
          price: 5.5,
          volume_remain: 10,
          issued: "2026-08-05T00:00:00Z",
          duration: 90,
          range: "region",
          state: "open",
        },
      ],
    };

    const updateActiveJob = openJob(job);

    expect(job.build.sale.marketOrders[0].volume_remain).toBe(10);
    expect(job.build.sale.marketOrders[0].item_price).toBe(5.5);
    expect(updateActiveJob).toHaveBeenCalledWith(job);
  });

  // Opening a job must not write it for nothing: an unchanged order would
  // otherwise mark every job modified on every visit.
  it("leaves an unchanged job alone", () => {
    const job = jobWithOrder();
    characterOrders.data = {
      "hash-1": [
        {
          order_id: 900,
          price: 5,
          volume_remain: 40,
          issued: "2026-08-01T00:00:00Z",
          duration: 90,
          range: "region",
          state: "open",
        },
      ],
    };

    const updateActiveJob = openJob(job);

    expect(updateActiveJob).not.toHaveBeenCalled();
  });

  // The dashboard usually warms the cache, but a cold one must not fetch or
  // wipe what the job holds.
  it("does nothing when the cache has not loaded", () => {
    const job = jobWithOrder();
    characterOrders.data = {};
    corporationOrders.data = {};

    const updateActiveJob = openJob(job);

    expect(job.build.sale.marketOrders[0].volume_remain).toBe(40);
    expect(updateActiveJob).not.toHaveBeenCalled();
  });

  it("prefers the corporation's own reading of a corporation order", () => {
    const job = jobWithOrder({ is_corporation: true });
    characterOrders.data = {
      "hash-1": [
        {
          order_id: 900,
          price: 5,
          volume_remain: 30,
          issued: "2026-08-05T00:00:00Z",
          state: "open",
        },
      ],
    };
    corporationOrders.data = {
      98000001: [
        {
          order_id: 900,
          price: 5,
          volume_remain: 12,
          issued: "2026-08-05T00:00:00Z",
          is_corporation: true,
          state: "open",
        },
      ],
    };

    openJob(job);

    expect(job.build.sale.marketOrders[0].volume_remain).toBe(12);
  });
});
