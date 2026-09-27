import { describe, expect, it, vi } from "vitest";

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock();
});

const { default: ShoppingList } = await import("./shoppingList.js");

const TRITANIUM = 34;
const PYERITE = 35;

function job(jobID, materials) {
  return {
    jobID,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          materialCount: Object.fromEntries(
            materials.map(({ typeID, needs }) => [
              String(typeID),
              { typeID, quantity: needs },
            ]),
          ),
        },
      },
      materials: Object.fromEntries(
        materials.map(({ typeID, bought = 0, cost = 1 }) => [
          String(typeID),
          {
            typeID,
            name: typeID === TRITANIUM ? "Tritanium" : "Pyerite",
            volume: 0.01,
            purchasing: bought
              ? { "p-1": { id: "p-1", itemCount: bought, itemCost: cost } }
              : {},
          },
        ]),
      ),
      childJobs: Object.fromEntries(
        materials.map(({ typeID, children = [] }) => [
          String(typeID),
          children,
        ]),
      ),
    },
  };
}

const itemFor = (list, typeID) =>
  list.items.find((item) => item.typeID === typeID);

describe("what a shopping list asks the reader to buy", () => {
  it("states what a job still needs of a material", () => {
    const list = new ShoppingList([
      job("job-1", [{ typeID: TRITANIUM, needs: 100, bought: 40 }]),
    ]);

    expect(itemFor(list, TRITANIUM)).toMatchObject({
      quantityRequired: 100,
      quantityToPurchase: 60,
      hasChild: false,
    });
  });

  it("leaves out a material the job has already bought in full", () => {
    const list = new ShoppingList([
      job("job-1", [{ typeID: TRITANIUM, needs: 100, bought: 100 }]),
    ]);

    expect(list.items).toEqual([]);
  });

  it("adds what a second job needs to the entry already there", () => {
    const list = new ShoppingList([
      job("job-1", [{ typeID: TRITANIUM, needs: 100 }]),
      job("job-2", [{ typeID: TRITANIUM, needs: 250 }]),
    ]);

    expect(list.items).toHaveLength(1);
    expect(itemFor(list, TRITANIUM).quantityToPurchase).toBe(350);
  });

  it("keeps a material built by a child job apart from the same one bought outright", () => {
    const list = new ShoppingList([
      job("job-1", [{ typeID: TRITANIUM, needs: 100, children: ["child-1"] }]),
      job("job-2", [{ typeID: TRITANIUM, needs: 250 }]),
    ]);

    const [built, bought] = list.items.filter(
      (item) => item.typeID === TRITANIUM,
    );

    expect(list.items).toHaveLength(2);
    expect(built.hasChild).toBe(true);
    expect(built.quantityToPurchase).toBe(100);
    expect(bought.hasChild).toBe(false);
    expect(bought.quantityToPurchase).toBe(250);
  });

  it("names every quantity as a number, whichever entry it landed in", () => {
    const list = new ShoppingList([
      job("job-1", [{ typeID: TRITANIUM, needs: 100, children: ["child-1"] }]),
      job("job-2", [{ typeID: TRITANIUM, needs: 250 }]),
      job("job-3", [{ typeID: PYERITE, needs: 40 }]),
    ]);

    for (const item of list.items) {
      expect(typeof item.quantityRequired).toBe("number");
      expect(typeof item.quantityToPurchase).toBe("number");
      expect(Number.isNaN(item.quantityToPurchase)).toBe(false);
      expect(typeof item.hasChild).toBe("boolean");
    }
  });

  it("orders the list by name", () => {
    const list = new ShoppingList([
      job("job-1", [
        { typeID: PYERITE, needs: 40 },
        { typeID: TRITANIUM, needs: 100 },
      ]),
    ]);

    expect(list.items.map((item) => item.name)).toEqual([
      "Pyerite",
      "Tritanium",
    ]);
  });
});
