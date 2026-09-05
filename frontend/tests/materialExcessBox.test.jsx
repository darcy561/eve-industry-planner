import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));

const { MaterialExcessBox_Purchasing } = await import(
  "../src/Components/Edit Job/Edit Job Components/Purchasing/Standard Layout/Material Cards/materialExcessBox.jsx"
);
const { default: Material } = await import("../src/Classes/jobMaterial.js");

function materialNeeding(quantity, purchases) {
  const material = new Material({ typeID: 34, name: "Tritanium" }, quantity);
  for (const [itemCount, itemCost] of purchases) {
    material.importPurchase({ itemCount, itemCost }, { recordExcess: true });
  }
  return material;
}

describe("the extra bought marker", () => {
  it("says how many more were bought than the job needs", () => {
    const material = materialNeeding(100, [[120, 5]]);

    render(<MaterialExcessBox_Purchasing material={material} />);

    expect(screen.getByText("20 extra")).toBeInTheDocument();
  });

  it("says nothing when the purchases match what is needed", () => {
    const material = materialNeeding(100, [[60, 5], [40, 5]]);

    render(<MaterialExcessBox_Purchasing material={material} />);

    expect(screen.queryByText(/extra/)).not.toBeInTheDocument();
  });
});
