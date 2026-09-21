import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

const { MaterialExcessBox_Purchasing } =
  await import("./materialExcessBox.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;
const TRITANIUM = 34;

/**
 * A material the job needs `quantity` of, with what was bought against it. How
 * many it needs is the setup's to say, which is why a job is opened for it.
 */
function materialNeeding(quantity, purchases) {
  const material = {
    typeID: TRITANIUM,
    name: "Tritanium",
    purchasing: Object.fromEntries(
      purchases.map(([itemCount, itemCost], index) => [
        String(index),
        { id: String(index), itemCount, itemCost },
      ]),
    ),
  };
  session().actions.closeSession();
  session().actions.openJob("job-1", {
    jobID: "job-1",
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity } },
        },
      },
      materials: { [TRITANIUM]: material },
    },
  });
  return material;
}

describe("the extra bought marker", () => {
  it("says how many more were bought than the job needs", () => {
    const material = materialNeeding(100, [[120, 5]]);

    render(<MaterialExcessBox_Purchasing material={material} />);

    expect(screen.getByText("20 extra")).toBeInTheDocument();
  });

  it("says nothing when the purchases match what is needed", () => {
    const material = materialNeeding(100, [
      [60, 5],
      [40, 5],
    ]);

    render(<MaterialExcessBox_Purchasing material={material} />);

    expect(screen.queryByText(/extra/)).not.toBeInTheDocument();
  });
});
