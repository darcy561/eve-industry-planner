import { describe, it, expect, vi, beforeEach } from "vitest";
import { jobTypes } from "../../Context/defaultValues";
import {
  MERCOXIT,
  UNREFINED_MORPHITE,
  VELDSPAR,
  reprocessingFile,
} from "../../tests/reprocessingFixtures.js";

const getReprocessingData = vi.fn();
const getFullItemList = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: (...args) => getReprocessingData(...args),
    getFullItemList: (...args) => getFullItemList(...args),
  });
});

const { resetReprocessing, primeReprocessing } =
  await import("../Static/reprocessing.js");
const { primeItems, resetItems } = await import("../Static/items.js");
const { reprocess } = await import("./engine/reprocess.js");
const { reprocessingSetupFrom } = await import("./engine/reprocessingSetup.js");
const {
  toMineralsAnswer,
  fromMineralsAnswer,
  typesPricedByToMinerals,
  typesPricedByFromMinerals,
} = await import("./reprocessingRuns.js");
const { parseInputMineralString } = await import("./reprocessingInput.js");
const { structureFromDocument } =
  await import("../Custom Structures/customStructure.js");

const setup = (skills = {}) =>
  reprocessingSetupFrom(
    structureFromDocument(undefined, jobTypes.reprocessing),
    skills,
  );
const { defaultPlannerReprocessingSettings } =
  await import("../../Context/defaultValues");
const settings = (changes = {}) => ({
  ...defaultPlannerReprocessingSettings(),
  compressedOre: "allow",
  ...changes,
});

async function prime(entries = [VELDSPAR]) {
  resetReprocessing();
  resetItems();
  getReprocessingData.mockResolvedValue(reprocessingFile(entries, {}));
  await Promise.all([primeReprocessing(), primeItems()]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  getFullItemList.mockResolvedValue({
    34: { type_id: 34, name: "Tritanium" },
    11399: { type_id: 11399, name: "Morphite" },
  });
  await prime();
});

describe("what pasted ore comes to", () => {
  it("reads the ore it was given", () => {
    const answer = toMineralsAnswer("Veldspar\t100", setup());

    expect(answer.result.items.map((item) => item.typeID)).toEqual(["1230"]);
  });

  it("totals the minerals by the engine's rule, leaving kept-back units out", () => {
    const { result } = toMineralsAnswer("Veldspar\t250", setup());

    expect(result.outputs).toEqual({ 34: 200 * 2 });
    expect(result.items[0].keptBack).toBe(50);
  });

  it("hands back what does not reprocess and each line it could not read", () => {
    const answer = toMineralsAnswer(
      "Tritanium\t100\nVeldspar\t100\nNo Such Thing\t2",
      setup(),
    );

    expect(answer.result.items.map((item) => item.typeID)).toEqual(["1230"]);
    expect(answer.notReprocessable.map((item) => item.name)).toEqual([
      "Tritanium",
    ]);
    expect(answer.unread).toEqual(["No Such Thing\t2"]);
  });

  it("is priced on the ore pasted and what it gives", () => {
    const answer = toMineralsAnswer("Veldspar\t100", setup());

    expect(typesPricedByToMinerals(answer.result).sort()).toEqual([
      "1230",
      "34",
    ]);
  });
});

describe("the ore to buy for pasted minerals", () => {
  const priceOf = (prices) => (typeID) => prices[String(typeID)] ?? 0;

  it("hands back the cheapest whole batches as items carrying what one batch gives", () => {
    const { oreSelection } = fromMineralsAnswer(
      parseInputMineralString("Tritanium\t1000").items,
      setup(),
      priceOf({ 1230: 10 }),
      settings(),
    );

    expect(oreSelection).toHaveLength(1);
    expect(oreSelection[0]).toMatchObject({
      id: "1230",
      totalQuantity: 500,
      reprocessedMaterials: { 34: 200 },
      percentageYield: 50,
      unitPrice: 10,
    });
  });

  it("chooses nothing the player excluded", () => {
    const { oreSelection } = fromMineralsAnswer(
      parseInputMineralString("Tritanium\t1000").items,
      setup(),
      priceOf({ 1230: 10, 34: 10 }),
      settings({ neverChoose: [1230] }),
    );

    expect(oreSelection).toEqual([]);
  });

  it("is priced on every ore it may choose and what each gives", () => {
    expect(typesPricedByFromMinerals().sort()).toEqual(["1230", "34"]);
  });

  it("gives an unrefined mineral outputs per batch that come to what its whole run gives", async () => {
    await prime([MERCOXIT, UNREFINED_MORPHITE]);
    const skills = { 3385: 5 };

    const { oreSelection } = fromMineralsAnswer(
      parseInputMineralString("Morphite\t10000").items,
      setup(skills),
      priceOf({ [UNREFINED_MORPHITE.id]: 10 }),
      settings({ neverChoose: [Number(MERCOXIT.id)] }),
    );
    const [run] = reprocess(
      [
        {
          typeID: UNREFINED_MORPHITE.id,
          quantity: oreSelection[0].totalQuantity,
        },
      ],
      setup(skills),
    ).items;

    expect(oreSelection.map((item) => item.id)).toEqual([
      UNREFINED_MORPHITE.id,
    ]);
    expect(
      oreSelection[0].reprocessedMaterials[11399] * oreSelection[0].batchCount,
    ).toBeCloseTo(run.outputs[11399], 6);
  });
});
