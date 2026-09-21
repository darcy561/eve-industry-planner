import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubElementHeights } from "../../../../tests/elementHeights";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import StructureForm from "./structureForm";
import { jobTypes, structureKinds } from "../../../../Context/defaultValues";
import { testQueryClient } from "../../../../tests/queryClients.js";

const addCustomStructure = vi.fn();
const addCustomStructureFunction = vi.fn();
const describeMarketLocation = vi.fn();

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock({});
});

vi.mock("../../../../Hooks/EveEsi/useAssetLocations", () => ({
  default: () => ({
    locations: [{ locationId: 60003760, name: "Jita IV-4", unreadable: false }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../../../../Functions/Structure/describeMarketLocation", () => ({
  default: (...args) => describeMarketLocation(...args),
}));

vi.mock("../../../../Functions/Structure/addCustomStructure", () => ({
  addCustomStructure: (...args) => addCustomStructureFunction(...args),
}));

vi.mock(
  "../../../../Functions/Debounce/userDocumentsPersistSchedule.js",
  () => ({
    scheduleDebouncedApplicationSettingsSave: vi.fn(),
  }),
);

/**
 * The structure form is the same form whatever screen it is on. These cover what
 * it offers and what it does with what a reader types, so the layout underneath
 * can change without the behaviour going quiet.
 */
function renderForm(props = {}) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <StructureForm
        selectedJobType={jobTypes.manufacturing}
        setIsLoading={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("the structure form", () => {
  beforeEach(() => {
    addCustomStructure.mockClear();
    addCustomStructureFunction.mockClear();
  });

  it("offers every part of a structure a reader has to choose", () => {
    renderForm();

    expect(screen.getByPlaceholderText("Display Name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add structure/i }),
    ).toBeInTheDocument();
  });

  it("labels each field with what it is for", () => {
    renderForm();

    // A select carries its own label as well as the field's, so each of these
    // is present once as the field heading and once on the control.
    expect(screen.getByText("Display name")).toBeInTheDocument();
    expect(screen.getByText("Rig slot 1")).toBeInTheDocument();
    expect(screen.getByText("Rig slot 2")).toBeInTheDocument();
    expect(screen.getByText("Solar System")).toBeInTheDocument();
    expect(screen.getAllByText("Structure Type").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Security Status").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Structure Tax").length).toBeGreaterThan(0);
  });

  it("keeps the name a reader types", async () => {
    const user = userEvent.setup();
    renderForm();

    const name = screen.getByPlaceholderText("Display Name");
    await user.type(name, "Sotiyo");

    expect(name).toHaveValue("Sotiyo");
  });

  it("adds the structure a reader has built", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("Display Name"), "Sotiyo");
    await user.click(screen.getByRole("button", { name: /add structure/i }));

    expect(addCustomStructureFunction).toHaveBeenCalledTimes(1);
    const [call] = addCustomStructureFunction.mock.calls;
    expect(call[0].structure.name).toBe("Sotiyo");
    // The row says its own kind, so nothing has to be told it alongside.
    expect(call[0].structure.jobType).toBe(jobTypes.manufacturing);
  });

  it("empties the form once a structure is added", async () => {
    const user = userEvent.setup();
    renderForm();

    const name = screen.getByPlaceholderText("Display Name");
    await user.type(name, "Sotiyo");
    await user.click(screen.getByRole("button", { name: /add structure/i }));

    expect(screen.getByPlaceholderText("Display Name")).toHaveValue("");
  });

  it("builds the form for the job type it is given", () => {
    renderForm({ selectedJobType: jobTypes.reaction });

    expect(screen.getByPlaceholderText("Display Name")).toBeInTheDocument();
    expect(screen.getAllByText("Structure Type").length).toBeGreaterThan(0);
  });
});

// A structure carries two rig slots, and rigs competing for the same purpose
// cannot both be fitted. The form refuses the second rather than keeping it
// silently, so the reader can see the choice was not taken.
describe("fitting two rigs", () => {
  async function chooseRig(slotLabel, rigLabel) {
    const field = screen.getByText(slotLabel).closest(".MuiGrid-root");
    await userEvent.click(within(field).getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: rigLabel }));
  }

  it("takes a rig in each slot when they do not compete", () => {
    renderForm();

    expect(screen.getByText("Rig slot 1")).toBeInTheDocument();
    expect(screen.getByText("Rig slot 2")).toBeInTheDocument();
  });

  it("refuses a rig that competes with the one already fitted", async () => {
    renderForm();

    await chooseRig("Rig slot 1", "T1 - ME - All");
    await chooseRig("Rig slot 2", "T2 - ME - All");

    // Both name a material bonus, so the second is refused and says why.
    expect(
      screen.getByText(
        "Cannot have the same rig or related rigs in both slots",
      ),
    ).toBeInTheDocument();
  });

  it("takes a rig that does something else", async () => {
    renderForm();

    await chooseRig("Rig slot 1", "T1 - ME - All");
    await chooseRig("Rig slot 2", "T1 - TE - All");

    expect(
      screen.queryByText(
        "Cannot have the same rig or related rigs in both slots",
      ),
    ).not.toBeInTheDocument();
  });
});

// One form serves every kind, so what it asks for is the one thing worth
// proving: a field a kind does not carry must not be asked for, because the
// class drops it and the reader would have described something unstored.
describe("what each kind is asked for", () => {
  // Matched on the field's own title rather than on any text: a control carries
  // its own label too, so a loose match counts one field twice.
  const TITLES = [
    "Location",
    "Structure Type",
    "Rig slot 1",
    "Rig slot 2",
    "Implant",
    "Security Status",
    "Structure Tax",
    "Broker fee",
    "Solar System",
  ];
  const asked = () =>
    TITLES.filter((title) =>
      screen
        .queryAllByText(title)
        .some((node) => !node.closest("label") && !node.closest("[role]")),
    );

  it("asks manufacturing for its rigs, tax, security and system", () => {
    renderForm({ selectedJobType: jobTypes.manufacturing });

    expect(asked()).toEqual([
      "Structure Type",
      "Rig slot 1",
      "Rig slot 2",
      "Security Status",
      "Structure Tax",
      "Solar System",
    ]);
  });

  it("asks reprocessing for an implant and no system", () => {
    renderForm({ selectedJobType: jobTypes.reprocessing });

    expect(asked()).toContain("Implant");
    expect(asked()).not.toContain("Solar System");
  });

  it("asks invention for neither an implant nor a system", () => {
    renderForm({ selectedJobType: jobTypes.invention });

    expect(asked()).not.toContain("Implant");
    expect(asked()).not.toContain("Solar System");
  });

  // A market is a place and a rate. Asking it for a rig or an installation tax
  // would be describing it as somewhere a job is built.
  // A market is asked where it is and nothing else until it knows: a station
  // has no rate of its own to give, and a citadel cannot be asked for one
  // before a citadel is the place chosen.
  it("asks a market for its location alone before a place is chosen", () => {
    renderForm({ selectedJobType: structureKinds.market });

    expect(asked()).toEqual(["Location"]);
  });
});

// Rendering a field is not the same as being able to use it. Every control the
// form offers calls a setter on the class, and a setter that does not exist
// throws when a reader touches the field rather than when the form draws it.
describe("every field the form offers can be set", () => {
  it("has a setter on the class for each field a kind carries", async () => {
    const { default: Structure } =
      await import("../../../../Classes/structure");
    const { STRUCTURE_FIELDS } = await import("./structureFields");

    // What the form's handlers call, by the field they belong to.
    const setterFor = {
      place: ["setPlace"],
      structureType: ["setStructureType"],
      rigSlot1: ["setRigSlot1"],
      rigSlot2: ["setRigSlot2"],
      implant: ["setImplant"],
      systemType: ["setSystemType"],
      tax: ["setTax"],
      brokerFee: ["setBrokerFee"],
      systemID: ["setSystemID"],
    };

    const structure = new Structure(undefined, structureKinds.market);
    for (const entry of STRUCTURE_FIELDS) {
      for (const setter of setterFor[entry.id] ?? []) {
        expect(typeof structure[setter], `${entry.id} needs ${setter}`).toBe(
          "function",
        );
      }
    }
    // A field with no entry above is one this test does not know how to check.
    expect(STRUCTURE_FIELDS.every((entry) => setterFor[entry.id])).toBe(true);
  });
});

// A field being settable is not the same as being settled. A saved market must
// carry a region, because an order book is read per region — a row without one
// is offered in every picker and prices nothing.
describe("what a saved market carries", () => {
  // The picker virtualises its list, and jsdom measures every element as zero
  // high, so without this it renders no options to choose from.
  let restoreHeights;
  beforeEach(() => {
    restoreHeights = stubElementHeights();
  });
  afterEach(() => restoreHeights?.());

  it("stores the region and fee inputs derived from the place chosen", async () => {
    // Three ESI calls deep, so it settles after the render that set the place.
    describeMarketLocation.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ regionID: 10000002, raceID: 1, ownerID: 1000035 }),
            10,
          ),
        ),
    );
    renderForm({ selectedJobType: structureKinds.market });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Structure name/i), "My Jita office");
    await user.type(screen.getByRole("combobox"), "Jita");
    await user.click(await screen.findByRole("option", { name: /Jita IV-4/ }));
    await user.click(screen.getByRole("button", { name: /Add structure/i }));

    const saved = addCustomStructureFunction.mock.calls.at(-1)[0].structure;
    expect(saved.toDocument()).toMatchObject({
      stationID: 60003760,
      regionID: 10000002,
      raceID: 1,
      ownerID: 1000035,
    });
  });
});

// Every picker lists saved rows by name, so a nameless one is an empty option
// among other empty options — a reader cannot pick the right one or tell they
// picked wrong.
describe("saving needs a name", () => {
  it("refuses a market with no name and says why", async () => {
    renderForm({ selectedJobType: structureKinds.market });

    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    expect(addCustomStructureFunction).not.toHaveBeenCalled();
    expect(
      screen.getByText("Give this a name so you can tell it apart in lists."),
    ).toBeInTheDocument();
  });

  // Not a market rule: nothing has ever checked, so every kind could be saved
  // nameless.
  it("refuses a build structure with no name too", async () => {
    renderForm({ selectedJobType: jobTypes.manufacturing });

    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    expect(addCustomStructureFunction).not.toHaveBeenCalled();
  });

  // Spaces are not a name. A row called " " is as hard to pick out as one
  // called nothing.
  it("refuses a name that is only spaces", async () => {
    renderForm({ selectedJobType: structureKinds.market });

    await userEvent.type(screen.getByLabelText(/Structure name/i), "   ");
    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    expect(addCustomStructureFunction).not.toHaveBeenCalled();
  });

  it("stops saying so once a name is given", async () => {
    renderForm({ selectedJobType: structureKinds.market });
    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    await userEvent.type(screen.getByLabelText(/Structure name/i), "Jita");

    expect(
      screen.queryByText("Give this a name so you can tell it apart in lists."),
    ).not.toBeInTheDocument();
  });
});
