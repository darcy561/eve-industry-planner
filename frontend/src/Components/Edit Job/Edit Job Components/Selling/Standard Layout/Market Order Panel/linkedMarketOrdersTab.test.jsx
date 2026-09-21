import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

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

vi.mock("../../../../../../Hooks/EveEsi/useLocationNames", () => ({
  default: () => ({ names: {} }),
}));

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

const { LinkedMarketOrdersTab } = await import("./linkedMarketOrdersTab.jsx");
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
    esi: {
      marketOrders: { 900: anOrder },
      transactions: {
        7: { transaction_id: 7, location_id: 60003760 },
        8: { transaction_id: 8, location_id: 60008494 },
      },
    },
  });

const show = (Tab = LinkedMarketOrdersTab) =>
  render(
    <ThemeProvider theme={theme}>
      <Tab />
    </ThemeProvider>,
  );

// One order, one control: the icon button carries no name of its own, so a
// second match would mean the list drew something it should not have.
const unlinkButton = () => screen.getByRole("button");

beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  session().actions.closeSession();
  openJob();
});

describe("the market orders linked to the job", () => {
  it("lists what the job carries", () => {
    show();

    expect(screen.getByText(/4\/10/)).toBeInTheDocument();
  });

  // Unlinking takes the order off the job and marks it, with the sales made at
  // the same place, to be released when the job closes.
  it("unlinks an order and marks its sales with it", () => {
    show();

    fireEvent.click(unlinkButton());

    expect(job().esi.marketOrders).toEqual({});
    const marked = session().esiDataToLink;
    expect(marked.marketOrders.remove).toContain(900);
    expect(marked.transactions.remove.map((row) => row.transaction_id)).toEqual(
      [7],
    );
  });

  it("will not unlink while the job is locked", () => {
    readOnly.current = true;

    show();

    expect(unlinkButton()).toBeDisabled();
  });

  it("is not re-rendered by a change to the rest of the job", async () => {
    const renders = renderCounts();
    show(renders.watch("linkedOrders", LinkedMarketOrdersTab));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (held) => {
          held.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("linkedOrders")).toBe(0);
  });
});
