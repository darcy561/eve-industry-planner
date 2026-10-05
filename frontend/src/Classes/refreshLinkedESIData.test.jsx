import { describe, expect, it, vi } from "vitest";
import {
  appliedTo,
  commandActions,
  commandsRun,
  unchangedBy,
} from "../tests/jobCommandSpy.js";
import { render } from "@testing-library/react";

const characterOrders = { data: {}, isLoading: false };
const corporationOrders = { data: {}, isLoading: false };
const industryJobs = { data: [], isLoading: false };

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: () => null,
}));
vi.mock("../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders", () => ({
  getAllCachedCharacterMarketOrders: () => characterOrders,
}));
vi.mock("../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders", () => ({
  getAllCachedCorporationMarketOrders: () => corporationOrders,
}));
vi.mock("../Hooks/EveEsi/useGetAllIndustryJobs", () => ({
  getCachedAllIndustryJobs: () => industryJobs,
}));
vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: { accountID: "acc-1", characters: [], isLoggedIn: false },
    jobData: { jobArray: [], actions: {} },
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  });
});

const { useRefreshLinkedESIData } =
  await import("../Components/Edit Job/Hooks/useRefreshLinkedESIData.js");
const { jobFromDocument, toDocument } =
  await import("../Functions/Job/jobDocument.js");

function jobWithOrder(overrides = {}) {
  return jobFromDocument({
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
  const actions = commandActions();
  function Editor() {
    useRefreshLinkedESIData(job, actions.run);
    return null;
  }
  render(<Editor />);
  return {
    actions,
    changed: commandsRun(actions).filter(
      (command) => !unchangedBy(command, toDocument(job)),
    ),
    refreshed: appliedTo(actions, toDocument(job)),
  };
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

    const { refreshed } = openJob(job);

    expect(refreshed.esi.marketOrders["900"].volume_remain).toBe(10);
    expect(refreshed.esi.marketOrders["900"].item_price).toBe(5.5);
  });

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

    const { changed } = openJob(job);

    expect(changed).toEqual([]);
  });

  it("does nothing when the cache has not loaded", () => {
    const job = jobWithOrder();
    characterOrders.data = {};
    corporationOrders.data = {};

    const { changed, refreshed } = openJob(job);

    expect(refreshed.esi.marketOrders["900"].volume_remain).toBe(40);
    expect(changed).toEqual([]);
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

    const { refreshed } = openJob(job);

    expect(refreshed.esi.marketOrders["900"].volume_remain).toBe(12);
  });
});
