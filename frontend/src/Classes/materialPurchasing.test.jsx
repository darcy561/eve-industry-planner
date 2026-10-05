import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  materialRequirementOf,
  totalMaterialCost,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors.js";

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreOverSession } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

const { MaterialCostsFrame_Purchasing } =
  await import("../Components/Edit Job/Edit Job Components/Purchasing/Standard Layout/Material Cards/materialCostsFrame.jsx");
const { jobFromDocument, toDocument } =
  await import("../Functions/Job/jobDocument.js");
const { default: useUsersStore } = await import("../Zustand/usersStore.js");
const { jobDraftNow } =
  await import("../Components/Edit Job/Edit Job Hooks/useJobDraft.js");
const { applyCommands, importPurchaseToMaterial } =
  await import("../Components/Edit Job/Edit Job Hooks/jobCommands.js");
const {
  excessQuantity,
  purchaseComplete,
  purchasedCost,
  quantityPurchased,
  quantityRemaining,
} = await import("../Components/Edit Job/Edit Job Hooks/materialSelectors.js");

const session = () => useUsersStore.getState().editSession;

function jobNeeding(quantity) {
  return jobFromDocument({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    itemsProducedPerRun: 10,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: { 34: { typeID: 34, quantity } },
        },
      },
      materials: { [String(34)]: { typeID: 34, name: "Tritanium", quantity } },
    },
  });
}

function priced(itemCount, itemCost, childID = null) {
  return { itemCount, itemCost, childID };
}

function need(job) {
  return materialRequirementOf(job.build.setup, 34);
}

function buy(job, purchase, options = {}) {
  const requirement = need(job);
  const availableToBuy = quantityRemaining(
    job.build.materials[34],
    requirement,
  );
  applyCommands(
    job,
    importPurchaseToMaterial(
      34,
      { id: crypto.randomUUID(), ...purchase },
      { ...options, availableToBuy },
    ),
  );
}

describe("adding a cost on a material card", () => {
  it("records the purchase and its cost", () => {
    const job = jobNeeding(100);

    buy(job, priced(40, 5), { recordExcess: true });

    const material = job.build.materials[34];
    expect(quantityPurchased(material, need(job))).toBe(40);
    expect(purchasedCost(material, need(job))).toBe(200);
    expect(purchaseComplete(material, need(job))).toBe(false);
    expect(totalMaterialCost(toDocument(job))).toBe(200);
  });

  it("counts a purchase only up to what the job needs, keeping the row whole", () => {
    const job = jobNeeding(100);

    buy(job, priced(40, 5), { recordExcess: true });
    buy(job, priced(80, 5), { recordExcess: true });

    const material = job.build.materials[34];
    expect(
      Object.values(material.purchasing).map((row) => row.itemCount),
    ).toEqual([40, 80]);
    expect(quantityPurchased(material, need(job))).toBe(100);
    expect(purchasedCost(material, need(job))).toBe(500);
    expect(excessQuantity(material, need(job))).toBe(20);
    expect(purchaseComplete(material, need(job))).toBe(true);
  });

  it("adds no cost once the material is covered", () => {
    const job = jobNeeding(100);

    buy(job, priced(100, 5), { recordExcess: true });
    buy(job, priced(50, 9), { recordExcess: true });

    expect(purchasedCost(job.build.materials[34], need(job))).toBe(500);
  });

  it("fills the requirement at the cheapest prices paid", () => {
    const job = jobNeeding(50);

    buy(job, priced(50, 20), { recordExcess: true });
    buy(job, priced(50, 5), { recordExcess: true });

    expect(purchasedCost(job.build.materials[34], need(job))).toBe(250);
    expect(excessQuantity(job.build.materials[34], need(job))).toBe(50);
  });
});

describe("pasting a multibuy on the purchasing panel", () => {
  it("takes the pasted quantity, capped at what the job still needs", () => {
    const job = jobNeeding(100);
    const material = job.build.materials[34];

    buy(job, priced(30, 5));
    buy(job, priced(200, 8));

    expect(
      Object.values(material.purchasing).map((row) => row.itemCount),
    ).toEqual([30, 70]);
    expect(quantityPurchased(material, need(job))).toBe(100);
    expect(purchasedCost(material, need(job))).toBe(710);
    expect(totalMaterialCost(toDocument(job))).toBe(710);
  });

  it("adds nothing when the material is already covered", () => {
    const job = jobNeeding(100);
    const material = job.build.materials[34];

    buy(job, priced(100, 5));
    buy(job, priced(50, 8));

    expect(Object.keys(material.purchasing)).toHaveLength(1);
  });
});

describe("removing a purchase from a material card", () => {
  it("takes the purchase and its cost back off the material", async () => {
    const job = jobNeeding(100);
    buy(job, priced(40, 5));
    buy(job, priced(30, 8));

    session().actions.closeSession();
    session().actions.openJob(job.jobID, toDocument(job));
    const material = jobDraftNow().build.materials[34];

    render(<MaterialCostsFrame_Purchasing material={material} />);

    await userEvent.click(screen.getAllByTestId("ClearIcon")[0]);

    const changed = jobFromDocument(jobDraftNow());
    const remaining = changed.build.materials[34];
    expect(
      Object.values(remaining.purchasing).map((row) => row.itemCount),
    ).toEqual([30]);
    expect(quantityPurchased(remaining, need(changed))).toBe(30);
    expect(purchasedCost(remaining, need(changed))).toBe(240);
    expect(totalMaterialCost(toDocument(changed))).toBe(240);
  });
});
