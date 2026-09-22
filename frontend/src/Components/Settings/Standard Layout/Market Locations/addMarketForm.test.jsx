import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import { stubElementHeights } from "../../../../tests/elementHeights";

const JITA = 60003760;
const AZBEL = 1035466617946;

const edits = { add: vi.fn() };
const marketEdits = vi.fn(() => edits);

vi.mock("./marketWriter", () => ({
  marketEdits: (...args) => marketEdits(...args),
}));

vi.mock("../../../../Events/snackbarEvents", () => ({
  showSnackbarSuccess: vi.fn(),
}));

let locationNames = { names: {}, failed: new Set(), isLoading: false };
vi.mock("../../../../Hooks/EveEsi/useLocationNames", () => ({
  default: (ids) =>
    ids.length
      ? locationNames
      : { names: {}, failed: new Set(), isLoading: false },
}));

vi.mock("../../../../Hooks/EveEsi/useAssetLocations", () => ({
  default: () => ({
    locations: [
      { locationId: JITA, name: "Jita IV-4", unreadable: false },
      { locationId: AZBEL, name: "Perimeter Azbel", unreadable: false },
    ],
    isLoading: false,
    isError: false,
  }),
}));

const describeMarketLocation = vi.fn();
vi.mock("../../../../Functions/Structure/describeMarketLocation", () => ({
  default: (...args) => describeMarketLocation(...args),
}));

const { testQueryClient } = await import("../../../../tests/queryClients.js");
const { default: AddMarketForm } = await import("./addMarketForm.jsx");

function show() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <AddMarketForm />
    </QueryClientProvider>,
  );
}

// jsdom measures every element at zero, which leaves the picker's virtualiser
// deciding one row is enough to draw.
let restoreHeights;
beforeEach(() => {
  restoreHeights = stubElementHeights();
});
afterEach(() => restoreHeights?.());

async function choose(typed, shown) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("combobox"), typed);
  await user.click(screen.getByText(shown));
}

function addButton() {
  return screen.getByRole("button", { name: "Add market" });
}

describe("AddMarketForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationNames = { names: {}, failed: new Set(), isLoading: false };
    describeMarketLocation.mockResolvedValue({
      regionID: 10000002,
      raceID: 1,
      ownerID: 1000035,
    });
  });

  // A market with no region is offered in every picker and prices nothing, so
  // there is nothing worth saving until the place has answered.
  it("offers nothing to save until a place has been chosen", () => {
    show();

    expect(addButton().disabled).toBe(true);
  });

  it("saves a station with what its broker fee is derived from", async () => {
    show();
    await choose("Jita", "Jita IV-4");
    await waitFor(() => expect(addButton().disabled).toBe(false));

    fireEvent.change(screen.getByLabelText("Market name"), {
      target: { value: "Jita" },
    });
    fireEvent.click(addButton());

    expect(edits.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Jita",
        stationID: JITA,
        regionID: 10000002,
        raceID: 1,
        ownerID: 1000035,
      }),
    );
  });

  // The name is how a reader tells one saved market from another, so a nameless
  // row would be an empty option among other empty options.
  it("refuses to save a market with no name", async () => {
    show();
    await choose("Jita", "Jita IV-4");
    await waitFor(() => expect(addButton().disabled).toBe(false));

    fireEvent.click(addButton());

    expect(edits.add).not.toHaveBeenCalled();
    expect(
      screen.getByText("Give this a name so you can tell it apart in lists."),
    ).toBeTruthy();
  });

  // A citadel's region is reached through the system its own record names, and
  // that record is read with a character's token as its name is.
  it("derives a citadel's region from the system held beside its name", async () => {
    locationNames = {
      names: { [AZBEL]: { solar_system_id: 30000144 } },
      failed: new Set(),
      isLoading: false,
    };
    describeMarketLocation.mockResolvedValue({ regionID: 10000002 });
    show();

    await choose("Perimeter", "Perimeter Azbel");
    await waitFor(() => expect(addButton().disabled).toBe(false));

    expect(describeMarketLocation).toHaveBeenCalledWith(AZBEL, 30000144);
  });

  // A citadel every character was refused at has a name from the community
  // store and no system, so no region can be worked out. The form says so
  // rather than waiting for an answer that is not coming.
  it("says a citadel nobody can read cannot be saved", async () => {
    locationNames = {
      names: { [AZBEL]: { name: "No Access - 1035466617946" } },
      failed: new Set(),
      isLoading: false,
    };
    show();

    await choose("Perimeter", "Perimeter Azbel");

    expect(
      await screen.findByText(/None of your characters can read this citadel/),
    ).toBeTruthy();
    expect(describeMarketLocation).not.toHaveBeenCalled();
    expect(addButton().disabled).toBe(true);
  });

  // A market saved for an organisation lands on that organisation's settings,
  // and which document that is belongs to the writer rather than to the form.
  it("saves for the organisation it was told to save for", async () => {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <AddMarketForm sharedBy="corporation:98000001" />
      </QueryClientProvider>,
    );
    await choose("Jita", "Jita IV-4");
    await waitFor(() => expect(addButton().disabled).toBe(false));

    fireEvent.change(screen.getByLabelText("Market name"), {
      target: { value: "Corp Jita" },
    });
    fireEvent.click(addButton());

    expect(marketEdits).toHaveBeenCalledWith("corporation:98000001");
    expect(edits.add).toHaveBeenCalled();
  });

  // A place the chain could not be walked for is said where the field is
  // described, rather than left for the reader to find when nothing prices.
  it("says when a place could not be read", async () => {
    describeMarketLocation.mockResolvedValue(null);
    show();

    await choose("Jita", "Jita IV-4");

    expect(await screen.findByText(/could not be read/)).toBeTruthy();
    expect(addButton().disabled).toBe(true);
  });
});
