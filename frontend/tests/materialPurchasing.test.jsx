import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));

const { MaterialCostsFrame_Purchasing } = await import(
  "../src/Components/Edit Job/Edit Job Components/Purchasing/Standard Layout/Material Cards/materialCostsFrame.jsx"
);
const { default: Job } = await import("../src/Classes/job.js");

// The same scenarios each purchasing surface handled before the material class
// owned them, run through the methods the call sites use now.
function jobNeeding(quantity) {
  return new Job({
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
      materials: [{ typeID: 34, name: "Tritanium", quantity }],
    },
  });
}

function priced(itemCount, itemCost, childID = null) {
  return { itemCount, itemCost, childID };
}

describe("adding a cost on a material card", () => {
  it("records the purchase and its cost", () => {
    const job = jobNeeding(100);

    job.importPurchaseToMaterial(34, priced(40, 5), { recordExcess: true });

    const material = job.build.materials[0];
    expect(material.quantityPurchased).toBe(40);
    expect(material.purchasedCost).toBe(200);
    expect(material.purchaseComplete).toBe(false);
    expect(job.totalMaterialCost).toBe(200);
  });

  it("counts a purchase only up to what the job needs, keeping the row whole", () => {
    const job = jobNeeding(100);

    job.importPurchaseToMaterial(34, priced(40, 5), { recordExcess: true });
    job.importPurchaseToMaterial(34, priced(80, 5), { recordExcess: true });

    const material = job.build.materials[0];
    expect(material.purchasing.map((row) => row.itemCount)).toEqual([40, 80]);
    expect(material.quantityPurchased).toBe(100);
    expect(material.purchasedCost).toBe(500);
    expect(material.excessQuantity).toBe(20);
    expect(material.purchaseComplete).toBe(true);
  });

  it("adds no cost once the material is covered", () => {
    const job = jobNeeding(100);

    job.importPurchaseToMaterial(34, priced(100, 5), { recordExcess: true });
    job.importPurchaseToMaterial(34, priced(50, 9), { recordExcess: true });

    expect(job.build.materials[0].purchasedCost).toBe(500);
  });

  // Entry order used to decide which purchases counted. The cheapest fill the
  // requirement now, so the dearest units are the ones left over.
  it("fills the requirement at the cheapest prices paid", () => {
    const job = jobNeeding(50);

    job.importPurchaseToMaterial(34, priced(50, 20), { recordExcess: true });
    job.importPurchaseToMaterial(34, priced(50, 5), { recordExcess: true });

    expect(job.build.materials[0].purchasedCost).toBe(250);
    expect(job.build.materials[0].excessQuantity).toBe(50);
  });
});

describe("pasting a multibuy on the purchasing panel", () => {
  it("takes the pasted quantity, capped at what the job still needs", () => {
    const job = jobNeeding(100);
    const material = job.build.materials[0];

    material.importPurchase(priced(30, 5));
    material.importPurchase(priced(200, 8));

    expect(material.purchasing.map((row) => row.itemCount)).toEqual([30, 70]);
    expect(material.quantityPurchased).toBe(100);
    expect(material.purchasedCost).toBe(710);
    expect(job.totalMaterialCost).toBe(710);
  });

  it("adds nothing when the material is already covered", () => {
    const job = jobNeeding(100);
    const material = job.build.materials[0];

    material.importPurchase(priced(100, 5));
    material.importPurchase(priced(50, 8));

    expect(material.purchasing).toHaveLength(1);
  });
});

describe("removing a purchase from a material card", () => {
  it("takes the purchase and its cost back off the material", async () => {
    const job = jobNeeding(100);
    job.importPurchaseToMaterial(34, priced(40, 5));
    job.importPurchaseToMaterial(34, priced(30, 8));

    const material = job.build.materials[0];
    const actions = { updateActiveJob: vi.fn() };

    render(
      <MaterialCostsFrame_Purchasing
        state={{ activeJob: job }}
        actions={actions}
        material={material}
      />
    );

    await userEvent.click(screen.getAllByTestId("ClearIcon")[0]);

    expect(material.purchasing.map((row) => row.itemCount)).toEqual([30]);
    expect(material.quantityPurchased).toBe(30);
    expect(material.purchasedCost).toBe(240);
    expect(job.totalMaterialCost).toBe(240);
    expect(actions.updateActiveJob).toHaveBeenCalled();
  });
});
