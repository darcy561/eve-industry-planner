import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";
import { withQueryClient } from "../../../../../../tests/utils.js";

const { readOnly } = vi.hoisted(() => ({ readOnly: { current: false } }));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    account: { actions: { getCorporation: () => null } },
  });
});

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
}));

const { nameHints } = vi.hoisted(() => ({ nameHints: [] }));

vi.mock(
  "../../../../../../Hooks/EveEsi/useLocationNames",
  async (importOriginal) => ({
    ...(await importOriginal()),
    default: (ids, likely) => {
      nameHints.push(likely);
      return { names: {} };
    },
  }),
);

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

// The figures a listing is charged, which the linked order carries with it.
const CHARGES = { brokerFee: 250, salesTax: 75 };

vi.mock("../../../../../../Functions/MarketOrders/calcSellingCharges", () => ({
  default: async () => CHARGES,
}));

const { AvailableMarketOrdersTab } = await import("./availableOrdersTab.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { draftFor } =
  await import("../../../../Edit Job Hooks/jobDraftStore.js");

const theme = createTheme();
const session = () => useUsersStore.getState().editSession;
const job = () => draftFor(session().draft, "job-1");

const anOrder = {
  order_id: 900,
  location_id: 60003760,
  price: 1000,
  volume_total: 10,
  volume_remain: 4,
  issued: "2026-01-01T00:00:00Z",
  CharacterHash: "hash-main",
};

const openJob = () =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    itemID: 587,
    build: {},
    esi: { marketOrders: {}, transactions: {} },
  });

const show = (Tab = AvailableMarketOrdersTab, orders = [anOrder]) =>
  render(
    withQueryClient(
      <ThemeProvider theme={theme}>
        <Tab itemOrderMatch={orders} />
      </ThemeProvider>,
    ),
  );

// One offer, one control: the icon button carries no name of its own.
const linkButton = () => screen.getByRole("button");

beforeEach(() => {
  nameHints.length = 0;
  vi.clearAllMocks();
  readOnly.current = false;
  session().actions.closeSession();
  openJob();
});

describe("the market orders the job could be linked to", () => {
  it("offers what was found for the item", () => {
    show();

    expect(screen.getByText(/4\/10/)).toBeInTheDocument();
  });

  it("links an order onto the job and marks it", async () => {
    show();

    fireEvent.click(linkButton());

    await waitFor(() =>
      expect(Object.keys(job().esi.marketOrders)).toEqual(["900"]),
    );
    expect(session().esiDataToLink.marketOrders.add).toContain(900);
  });

  // The fee is worked out for this order at the moment it is linked, and is
  // stored with it — the journal is not asked what it cost.
  it("records what the listing was charged", async () => {
    show();

    fireEvent.click(linkButton());

    await waitFor(() => expect(job().esi.marketOrders["900"]).toBeDefined());
    expect(job().esi.marketOrders["900"]).toMatchObject({
      fee: CHARGES.brokerFee,
      salesTax: CHARGES.salesTax,
    });
  });

  it("will not link while the job is locked", () => {
    readOnly.current = true;

    show();

    expect(linkButton()).toBeDisabled();
  });

  it("is not re-rendered by a change to the rest of the job", async () => {
    const renders = renderCounts();
    show(renders.watch("availableOrders", AvailableMarketOrdersTab));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (held) => {
          held.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("availableOrders")).toBe(0);
  });
});

// A structure refuses every character that cannot dock there, so the order names its seller rather
// than the whole account being walked.
describe("naming an order's location", () => {
  it("offers the character the order was listed by", () => {
    show();

    expect(nameHints.at(-1)).toEqual(
      new Map([[anOrder.location_id, new Set(["hash-main"])]]),
    );
  });
});
