import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PricedSurface } from "../../tests/pricedSurface.jsx";
import seedPrices, { clearSeededPrices } from "../../tests/seedPrices.js";
import { seedItemRecords } from "../../tests/seedItems.js";
import { queryClient } from "../../queryClient";
import {
  CLEAR_ICICLE,
  HEDBERGITE,
  PRISMATICITE,
  UNREFINED_MORPHITE,
  VELDSPAR,
  reprocessingFile,
} from "../../tests/reprocessingFixtures.js";

const { store, itemListWait } = vi.hoisted(() => ({
  store: { current: null },
  itemListWait: { ms: 0 },
}));
const ORE_RIG = {
  id: 46640,
  label: "Standup M-Set Asteroid Ore Grading Processor I",
  kind: "rig",
  size: 2,
  groupID: 1941,
  bonuses: [{ activity: "reprocessing", axis: "value", value: 1 }],
};
const CATALOGUE = { families: {}, sources: { [ORE_RIG.id]: ORE_RIG } };
const ITEMS = {
  34: { type_id: 34, name: "Tritanium" },
  35: { type_id: 35, name: "Pyerite" },
  36: { type_id: 36, name: "Mexallon" },
  37: { type_id: 37, name: "Isogen" },
  38: { type_id: 38, name: "Nocxium" },
  39: { type_id: 39, name: "Zydrine" },
  40: { type_id: 40, name: "Megacyte" },
  11399: { type_id: 11399, name: "Morphite" },
  90041: { type_id: 90041, name: "Prismaticite" },
  90298: { type_id: 90298, name: "Unrefined Morphite" },
  1230: { type_id: 1230, name: "Veldspar" },
  16262: { type_id: 16262, name: "Clear Icicle" },
  3828: { type_id: 3828, name: "Construction Blocks" },
  3385: { type_id: 3385, name: "Reprocessing" },
  3389: { type_id: 3389, name: "Reprocessing Efficiency" },
  60377: { type_id: 60377, name: "Simple Ore Processing" },
  60378: { type_id: 60378, name: "Coherent Ore Processing" },
  18025: { type_id: 18025, name: "Ice Processing" },
};

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: async () =>
      reprocessingFile(
        [VELDSPAR, CLEAR_ICICLE, HEDBERGITE, PRISMATICITE, UNREFINED_MORPHITE],
        {},
      ),
    getFullItemList: async () => {
      await new Promise((resolve) => setTimeout(resolve, itemListWait.ms));
      return ITEMS;
    },
    getIndustryBonuses: async () => CATALOGUE,
  });
});

vi.mock("../../Hooks/EveEsi/Character/useGetCharacterSkills", () => ({
  useGetCharacterSkills: () => ({ isLoading: false, isError: false }),
  getCachedCharacterSkills: () => ({ data: null }),
}));

vi.mock("../../Styled Components/autocomplete/virtualisedListbox", () => ({
  default: ({ children, virtualizerControlRef: _control, ref, ...other }) => (
    <ul ref={ref} {...other}>
      {children}
    </ul>
  ),
}));

vi.mock("../Dialogues/Price History/dialogueFrame", () => ({
  default: () => null,
}));
vi.mock("../Dialogues/Market Data/dialogueFrame", () => ({
  default: () => null,
}));
vi.mock("../Dialogues/Assets/dialogueFrame", () => ({ default: () => null }));

const { resetReprocessing } =
  await import("../../Functions/Static/reprocessing.js");
const { resetItems } = await import("../../Functions/Static/items.js");
const { resetIndustryBonuses } =
  await import("../../Functions/Static/industryBonuses.js");
const { Route } = await import("../../routes/reprocessing.jsx");
const { jobTypes, structureTypeMap, CACHED_DATA_FILES } =
  await import("../../Context/defaultValues");
const { default: ReprocessingPage } = await import("./reprocessingPage.jsx");

const theme = createTheme();

function show() {
  return render(
    <PricedSurface>
      <ThemeProvider theme={theme}>
        <ReprocessingPage />
      </ThemeProvider>
    </PricedSurface>,
  );
}

const paste = () => screen.getByRole("textbox", { name: /^Paste/ });
const direction = (name) =>
  screen.getByRole("radio", { name: new RegExp(name) });
const tritaniumGiven = () => {
  const table = screen.getByRole("table", { name: "What you get" });
  const row = within(table).getByText("Tritanium").closest("tr");
  return Number(row.querySelectorAll("td")[1].textContent.replace(/,/g, ""));
};

async function pick(picker, optionName) {
  await userEvent.click(picker);
  await userEvent.click(screen.getByRole("option", { name: optionName }));
}

beforeEach(async () => {
  store.current = {
    account: {
      isLoggedIn: false,
      actions: { getMainCharacterHash: () => null },
    },
    applicationSettings: {
      customStructures: [],
      actions: {
        getDefaultReprocessingCharacter: () => null,
        getDefaultCustomStructureWithJobType: () => null,
      },
    },
  };
  resetReprocessing();
  resetItems();
  resetIndustryBonuses();
  await Route.options.loader();
  seedItemRecords(queryClient, ITEMS);
  queryClient.setQueryData(
    ["static", CACHED_DATA_FILES.INDUSTRY_BONUSES],
    CATALOGUE,
  );
  seedPrices({
    jita: {
      34: { sell: 5 },
      35: { sell: 10 },
      36: { sell: 48 },
      37: { sell: 118 },
      38: { sell: 40 },
      39: { sell: 1050 },
      40: { sell: 2600 },
      11399: { sell: 9800 },
      90041: { sell: 20500 },
      90298: { sell: 11500 },
      1230: { sell: 15 },
      21: { sell: 900 },
      16262: { sell: 300 },
      16272: { sell: 100 },
      16273: { sell: 100 },
      16274: { sell: 100 },
      16275: { sell: 100 },
    },
  });
});

afterEach(() => {
  itemListWait.ms = 0;
  clearSeededPrices();
});

describe("the Reprocessing page", () => {
  it("keeps each direction's paste when the reader switches between them", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(direction("From minerals"));

    expect(paste()).toHaveValue("");

    await user.type(paste(), "Tritanium\t500");
    await user.click(direction("To minerals"));

    expect(paste()).toHaveValue("Veldspar\t1000");
  });

  it("follows a change to the setup with no button pressed", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    const structures = structureTypeMap[jobTypes.reprocessing];
    await screen.findByRole("table", { name: "What you get" });
    await pick(screen.getAllByRole("combobox")[0], structures[1].label);
    const before = tritaniumGiven();

    const rigPicker = screen
      .getAllByRole("combobox")
      .find((box) => box.id?.startsWith("rig-type-select"));
    await pick(rigPicker, new RegExp(ORE_RIG.label));

    expect(rigPicker).toHaveValue(ORE_RIG.label);
    expect(tritaniumGiven()).toBeGreaterThan(before);
  });

  it("waits for Reprocess before reading a changed paste", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    await screen.findByRole("table", { name: "What you get" });
    const committed = tritaniumGiven();

    await user.type(paste(), "0");

    expect(tritaniumGiven()).toBe(committed);
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    expect(tritaniumGiven()).toBe(committed * 10);
  });

  it("plans the ore to buy for pasted minerals once their prices are in", async () => {
    const user = userEvent.setup();
    show();

    await user.click(direction("From minerals"));
    await user.type(paste(), "Tritanium\t1000");
    await user.click(screen.getByRole("button", { name: "Find ore" }));

    expect(await screen.findByText("Veldspar")).toBeInTheDocument();
  });

  it("lists the skills the pasted items use, and the rest only when asked", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000\nClear Icicle\t10");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));

    const listed = () =>
      screen
        .getAllByRole("button", { name: / at level 1$/ })
        .map((pip) =>
          pip.getAttribute("aria-label").replace(" at level 1", ""),
        );
    expect(listed()).toEqual([
      "Reprocessing",
      "Reprocessing Efficiency",
      "Simple Ore Processing",
      "Ice Processing",
    ]);

    await user.click(
      screen.getByRole("button", { name: "Show all reprocessing skills" }),
    );
    expect(listed()).toContain("Coherent Ore Processing");
  });

  it("lists what no ore yields and what it could not read apart from the minerals it read", async () => {
    const user = userEvent.setup();
    show();

    await user.click(direction("From minerals"));
    await user.type(
      paste(),
      "Tritanium\t1000\nConstruction Blocks\t5\nNo Such Thing\t2",
    );
    await user.click(screen.getByRole("button", { name: "Find ore" }));

    expect(await screen.findByText("1 mineral read")).toBeInTheDocument();
    expect(
      screen.getByText("No ore yields this; buy it as it is"),
    ).toBeInTheDocument();
    expect(screen.getByText("Construction Blocks")).toBeInTheDocument();
    expect(screen.getByText(/^No Such Thing\s+2$/)).toBeInTheDocument();
  });

  it("folds the setup to a summary in From minerals, with its controls a click away", async () => {
    const user = userEvent.setup();
    show();

    await user.click(direction("From minerals"));

    expect(screen.getByText(/tax 0\.0%/)).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Tax %" })).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "Show Structure, rigs, implant and the skills this ore uses",
      }),
    );
    expect(
      screen.getByRole("spinbutton", { name: "Tax %" }),
    ).toBeInTheDocument();
  });

  it("states what the paste comes to reprocessed and sold as it is, after fees", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));

    expect(await screen.findAllByText("9,512.50")).not.toHaveLength(0);
    expect(screen.getAllByText("14,268.75")).not.toHaveLength(0);
    expect(screen.getAllByText("-4,756.25")).not.toHaveLength(0);
  });

  it("totals what you get from market value down to after fees and tax", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    const table = await screen.findByRole("table", { name: "What you get" });

    expect(
      within(within(table).getByText("Market value").closest("tr")).getByText(
        "10,000.00",
      ),
    ).toBeInTheDocument();
    expect(
      within(
        within(table).getByText("After fees and tax").closest("tr"),
      ).getByText("9,512.50"),
    ).toBeInTheDocument();
  });

  it("opens an item to show what each batch gives", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    await user.click(
      await screen.findByRole("button", { name: "Show what Veldspar gives" }),
    );

    const drawer = await screen.findByRole("table", {
      name: "What Veldspar gives",
    });
    expect(within(drawer).getByText("400 → 200")).toBeInTheDocument();
    expect(within(drawer).getByText("2,000")).toBeInTheDocument();
    expect(within(drawer).getByText("7.50")).toBeInTheDocument();
  });

  it("marks an item under the 100 units it reprocesses in", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t50");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));

    expect(await screen.findByText("Under 100 units")).toBeInTheDocument();
  });

  it("offers each order side with what reprocessing comes to on it", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    await user.click(
      await screen.findByRole("button", { name: "Sell Orders" }),
    );

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(
      within(
        options.find(
          (option) => option.getAttribute("aria-selected") === "true",
        ),
      ).getByText(/9,512\.50/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("option", { name: /^Buy Orders best bid/ }),
    );
    expect(
      screen.getByRole("button", { name: "Buy Orders" }),
    ).toBeInTheDocument();
  });

  it("counts units kept back, sold as they are, in what you get", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1035");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    const table = await screen.findByRole("table", { name: "What you get" });

    expect(
      within(
        within(table).getByText("Kept back, sold as they are").closest("tr"),
      ).getByText("499.41"),
    ).toBeInTheDocument();
    expect(
      within(
        within(table).getByText("After fees and tax").closest("tr"),
      ).getByText("10,011.91"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/includes 35 units kept back, sold as they are/),
    ).toBeInTheDocument();
  });

  it("copies what you get as a list EVE reads", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    await user.click(
      await screen.findByRole("button", { name: /Copy as list/ }),
    );

    expect(await navigator.clipboard.readText()).toBe("Tritanium 2000\n");
  });

  it("gives erratic ore and unrefined minerals as ranges, with the odds of coming out ahead", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Prismaticite\t4000\nUnrefined Morphite\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));

    expect(await screen.findByText("Comes out ahead")).toBeInTheDocument();
    expect(screen.getByText(/^\d+ in 100$/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Prismaticite collapses into one of 8 minerals for every 100 units and Unrefined Morphite gives a varying amount/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /^Reprocessed value: likely/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("One mineral per 100 units")).toBeInTheDocument();
    expect(screen.getByText("Amount varies")).toBeInTheDocument();
    expect(screen.getAllByText(/^ahead \d+ in 100$/)).toHaveLength(2);
  });

  it("opens erratic ore to show what each mineral could come to", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Prismaticite\t4000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Show what Prismaticite gives",
      }),
    );

    const drawer = await screen.findByRole("table", {
      name: "What Prismaticite gives",
    });
    expect(within(drawer).getAllByRole("row")).toHaveLength(9);
    expect(screen.getByText("None to 3× expected")).toBeInTheDocument();
    expect(
      within(drawer).getByRole("img", { name: /^Morphite: expected/ }),
    ).toBeInTheDocument();
  });

  it("marks what erratic ore gives as expected, with its likely units", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Prismaticite\t4000\nVeldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    const table = await screen.findByRole("table", { name: "What you get" });

    expect(
      within(table).getByRole("columnheader", { name: "Likely" }),
    ).toBeInTheDocument();
    const morphite = within(table).getByText("Morphite").closest("tr");
    expect(morphite.querySelectorAll("td")[1].textContent).toMatch(/^~/);
    expect(morphite.querySelectorAll("td")[2].textContent).toMatch(/ – /);
  });

  it("leaves the likely column out when nothing varies", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    const table = await screen.findByRole("table", { name: "What you get" });

    expect(
      within(table).queryByRole("columnheader", { name: "Likely" }),
    ).toBeNull();
    expect(screen.queryByText("Comes out ahead")).toBeNull();
  });

  it("states how many units an item reprocesses in rather than counting batches", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    const table = await screen.findByRole("table", { name: "Item by item" });

    expect(
      within(table).queryByRole("columnheader", { name: "Batches" }),
    ).toBeNull();
    expect(
      within(table).getByText("Ore · reprocessed 100 at a time"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Show what Veldspar gives" }),
    );
    const drawer = await screen.findByRole("table", {
      name: "What Veldspar gives",
    });
    expect(
      within(drawer).getByRole("columnheader", { name: "Per 100 units" }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole("columnheader", { name: "From 1,000 units" }),
    ).toBeInTheDocument();
  });

  it("reads the paste after a new build drops the reprocessing file it opened with", async () => {
    const user = userEvent.setup();
    show();

    act(() => resetReprocessing());
    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));

    expect(
      await screen.findByRole("table", { name: "What you get" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 item read")).toBeInTheDocument();
  });

  it("lists a pasted item that does not reprocess apart from what it could not read", async () => {
    const user = userEvent.setup();
    show();

    await user.type(
      paste(),
      "Veldspar\t1000\nConstruction Blocks\t5\nNo Such Thing\t2",
    );
    await user.click(screen.getByRole("button", { name: "Reprocess" }));

    expect(
      await screen.findByText("1 line not reprocessable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Not ore, ice or gas: left out"),
    ).toBeInTheDocument();
    expect(screen.getByText("Construction Blocks")).toBeInTheDocument();
    expect(screen.getByText("1 not read")).toBeInTheDocument();
  });

  it("lists the items in the order they were pasted", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Clear Icicle\t10\nVeldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    const table = await screen.findByRole("table", { name: "Item by item" });

    const names = within(table)
      .getAllByRole("button", { name: /^Show what / })
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual([
      "Show what Clear Icicle gives",
      "Show what Veldspar gives",
    ]);
  });

  it("names each part of the value bar with its share", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));

    expect(await screen.findByText("Tritanium 100.0%")).toBeInTheDocument();
  });

  it("states signed out fees at every market skill, at the market and side the figures use", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));

    expect(
      await screen.findByText(
        /^Sell Orders at .+ · fees .+, every market skill at V$/,
      ),
    ).toBeInTheDocument();
  });

  it("offers nothing to reprocess until something is pasted", () => {
    show();

    expect(screen.getByRole("button", { name: "Reprocess" })).toBeDisabled();
  });

  it("keeps what does not reprocess apart after a new build drops both static files", async () => {
    const user = userEvent.setup();
    show();

    await user.type(paste(), "Veldspar\t1000\nConstruction Blocks\t5");
    await user.click(screen.getByRole("button", { name: "Reprocess" }));
    await screen.findByText("1 line not reprocessable");
    itemListWait.ms = 50;
    act(() => {
      resetItems();
      resetReprocessing();
    });

    expect(
      await screen.findByText("1 line not reprocessable"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not read$/)).toBeNull();
  });
});
