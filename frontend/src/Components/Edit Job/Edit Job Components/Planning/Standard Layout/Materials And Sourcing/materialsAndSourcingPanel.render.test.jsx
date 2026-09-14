import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MATERIAL_PLAN } from "../../../../../../Functions/MarketData/materialSourcingRow";

const sourcing = {
  rows: [
    {
      typeID: 34,
      name: "Tritanium",
      quantity: 1000,
      buyPrice: 5.4,
      buildPrice: 4.95,
      delta: -0.083,
      plan: MATERIAL_PLAN.BUY,
      isBuildable: true,
      isLinked: false,
      volume: 10,
      material: { typeID: 34, name: "Tritanium" },
      matchedChildJobs: [],
      marketLocation: "jita",
      listingType: "sell",
    },
  ],
  summary: {
    materials: 1,
    buildable: 1,
    costed: 1,
    linked: 0,
    volume: 10,
    savingAvailable: 450,
    cheaperToBuild: 1,
  },
  marketLocation: "jita",
  listingType: "sell",
  basisUsage: { overridden: 1, purchased: 0 },
  basisOptions: [
    {
      id: "sell",
      label: "Sell Orders",
      total: 5400,
      delta: 0,
      isCurrent: true,
    },
    {
      id: "buy",
      label: "Buy Orders",
      total: 4950,
      delta: -450,
      isCurrent: false,
    },
  ],
};

const useMaterialsSourcingMock = vi.fn(() => sourcing);

vi.mock("./useMaterialsSourcing", () => ({
  useMaterialsSourcing: (...args) => useMaterialsSourcingMock(...args),
}));

const buildSpeculativeChildJobs = vi.fn().mockResolvedValue(0);
const useActiveJobReadOnly = vi.fn(() => false);

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: (...args) => useActiveJobReadOnly(...args),
}));
const markChildJobsForAddition = vi.fn();
const forgetSpeculativeChildJobs = vi.fn();

vi.mock("./Hooks/useChildJobBuildActions", () => ({
  useChildJobBuildActions: () => ({ buildSpeculativeChildJobs }),
}));

// Stood in for, so the test proves the panel reaches the row's own buy-or-build
// control rather than standing up the whole child-job stack behind it.
vi.mock("./planChip", () => ({
  default: ({ material, rowJob }) => (
    <span data-testid={`plan-${material.typeID}`}>
      {rowJob ? "costed" : "uncosted"}
    </span>
  ),
}));

// Stood in for, so the test proves the panel reaches the drawer rather than
// standing up the whole child-job stack.
vi.mock("./materialDrawer", () => ({
  default: ({ isOpen, material, marketLocation, pricing }) => (
    <div data-testid={`drawer-${material.typeID}`}>
      {isOpen ? `open at ${marketLocation}` : "shut"}
      <span data-testid={`pricing-${material.typeID}`}>
        {pricing
          ? `panel ${pricing.panelMarketLocation}/${pricing.panelListingType}`
          : "none"}
      </span>
    </div>
  ),
}));

const { default: MaterialsAndSourcingPanel } =
  await import("./materialsAndSourcingPanel.jsx");

const state = {
  activeJob: {
    selectedSetup: { id: "setup-1" },
    layout: { materialPriceOverrides: {} },
    build: { materials: [] },
  },
};

function renderPanel(props = {}) {
  return render(
    <MaterialsAndSourcingPanel
      state={state}
      actions={{
        updateActiveJob: () => {},
        markChildJobsForAddition,
        forgetSpeculativeChildJobs,
      }}
      {...props}
    />,
  );
}

beforeEach(() => {
  useActiveJobReadOnly.mockReturnValue(false);
  // Every test starts from a fully costed panel; the ones about pricing say so.
  useMaterialsSourcingMock.mockReturnValue(sourcing);
});

describe("the Materials and Sourcing panel", () => {
  it("titles itself and lists the materials", () => {
    renderPanel();

    expect(screen.getByText("Materials & Sourcing")).toBeInTheDocument();
    expect(screen.getByText("Tritanium")).toBeInTheDocument();
  });

  it("offers what building the cheaper rows would save", () => {
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Building 1 of 1 saves/,
    );
  });

  it("counts the list beneath it", () => {
    renderPanel();

    expect(
      screen.getByText("1 material · 1 buildable · 0 linked"),
    ).toBeInTheDocument();
  });

  it("gives each row a drawer, and opens it when the row is clicked", async () => {
    // The drawer was built and never wired in; only rendering the panel sees
    // that, which is why this test exists rather than a helper test beside it.
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByTestId("drawer-34")).toHaveTextContent("shut");

    await user.click(screen.getByText("Tritanium").closest("tr"));

    expect(screen.getByTestId("drawer-34")).toHaveTextContent("open at jita");
  });

  it("closes a drawer that is open when its row is clicked again", async () => {
    const user = userEvent.setup();
    renderPanel();
    const row = () => screen.getByText("Tritanium").closest("tr");

    await user.click(row());
    await user.click(row());

    expect(screen.getByTestId("drawer-34")).toHaveTextContent("shut");
  });

  it("says how many rows are off the panel's basis", async () => {
    // An override is invisible on the row, so the picker is where it surfaces.
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Sell Orders/ }));

    expect(screen.getByText("1 overridden")).toBeInTheDocument();
  });

  it("gives each row the means to price itself differently", () => {
    // A row's own price outranks the panel's basis, so the control that sets
    // it has to be on the row.
    renderPanel();

    expect(screen.getByTestId("pricing-34")).toHaveTextContent(
      "panel jita/sell",
    );
  });

  it("draws nothing at all without a setup to cost", () => {
    const { container } = render(
      <MaterialsAndSourcingPanel
        state={{ activeJob: {} }}
        actions={{
          updateActiveJob: () => {},
          markChildJobsForAddition,
          forgetSpeculativeChildJobs,
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("how the panel sits in the stage's layout", () => {
  it("takes its own height rather than its parent's", () => {
    // AppShellPanel is full height by default, which is meant for panels
    // sharing a grid row. The stage stacks them, so one filling its parent
    // renders as a tall empty box and pushes the rest down the page. Every
    // other panel on this stage sets height auto too.
    renderPanel();

    const paper = document.querySelector(".MuiPaper-root");
    expect(paper).not.toHaveStyle({ height: "100%" });
  });
});

// Pricing a row means building a whole speculative job for it, so the panel asks
// rather than doing it on arrival.
describe("costing the buildable rows", () => {
  const uncosted = () => ({
    ...sourcing,
    rows: [{ ...sourcing.rows[0], buildPrice: null, delta: null }],
    summary: { ...sourcing.summary, costed: 0 },
  });

  // Two batched requests that write nothing outside the page is not worth
  // asking permission for, and the alert that asked could not be dismissed by
  // any route but doing the work.
  it("prices the rows that have no build price, without being asked", async () => {
    useMaterialsSourcingMock.mockReturnValue(uncosted());

    renderPanel();

    await waitFor(() => expect(buildSpeculativeChildJobs).toHaveBeenCalled());
  });

  // The pricing may not answer for every row — a material with no blueprint the
  // app can reach stays uncosted — and without a guard the effect would see the
  // same unpriced rows and ask again on every render that follows.
  it("asks once even while rows it could not price remain uncosted", async () => {
    useMaterialsSourcingMock.mockReturnValue(uncosted());

    const { rerender } = renderPanel();
    await waitFor(() => expect(buildSpeculativeChildJobs).toHaveBeenCalled());

    // Still uncosted, and now a different count: a fresh reason for the effect
    // to run, which only the guard stops.
    useMaterialsSourcingMock.mockReturnValue({
      ...uncosted(),
      summary: { ...sourcing.summary, buildable: 2, costed: 0 },
    });
    rerender(
      <MaterialsAndSourcingPanel
        state={state}
        actions={{
          updateActiveJob: () => {},
          markChildJobsForAddition,
          forgetSpeculativeChildJobs,
        }}
      />,
    );

    expect(buildSpeculativeChildJobs).toHaveBeenCalledTimes(1);
  });

  it("prices nothing once every buildable row has a price", () => {
    renderPanel();

    expect(buildSpeculativeChildJobs).not.toHaveBeenCalled();
  });

  // Nothing asks on the player's behalf any more, so a failure that left the
  // guard set would stand the panel down for the rest of the visit with no way
  // back but leaving the job and returning to it.
  it("asks again after an attempt that failed", async () => {
    useMaterialsSourcingMock.mockReturnValue(uncosted());
    buildSpeculativeChildJobs.mockRejectedValueOnce(new Error("ESI is down"));

    const { rerender } = renderPanel();
    await waitFor(() => expect(buildSpeculativeChildJobs).toHaveBeenCalled());

    rerender(
      <MaterialsAndSourcingPanel
        state={state}
        actions={{
          updateActiveJob: () => {},
          markChildJobsForAddition,
          forgetSpeculativeChildJobs,
        }}
      />,
    );

    await waitFor(() =>
      expect(buildSpeculativeChildJobs).toHaveBeenCalledTimes(2),
    );
  });

  // A reader who cannot edit the job cannot act on what the pricing would say.
  it("prices nothing on a job held by someone else", async () => {
    useMaterialsSourcingMock.mockReturnValue(uncosted());
    useActiveJobReadOnly.mockReturnValue(true);

    renderPanel();

    expect(buildSpeculativeChildJobs).not.toHaveBeenCalled();
  });
});

// The offer only became reachable once rows could be costed without committing,
// so its Apply is new ground: it must promote the speculative jobs it is
// offering rather than rendering as a button that does nothing.
describe("applying the offer", () => {
  it("promotes the speculative job behind each cheaper-to-build row", async () => {
    const speculative = { jobID: "spec-34", itemID: 34 };
    useMaterialsSourcingMock.mockReturnValueOnce(sourcing);

    renderPanel({
      state: { ...state, speculativeChildJobs: { 34: speculative } },
    });

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(markChildJobsForAddition).toHaveBeenCalledWith([speculative]);
  });

  // The committed job now lives in the temporary map, and a row reads that
  // first; a copy left behind would be offered again after an unlink.
  it("drops the promoted jobs from the speculative map", async () => {
    const speculative = { jobID: "spec-34", itemID: 34 };

    renderPanel({
      state: { ...state, speculativeChildJobs: { 34: speculative } },
    });

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(forgetSpeculativeChildJobs).toHaveBeenCalledWith([34]);
  });

  it("does nothing when no speculative job backs the offer", async () => {
    renderPanel({ state: { ...state, speculativeChildJobs: {} } });

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(markChildJobsForAddition).not.toHaveBeenCalled();
  });
});

// The picker names the basis every row is priced on. It listed four options with
// real totals long before choosing one did anything, which reads as a working
// control and is not.
describe("choosing a pricing basis", () => {
  const updateActiveJob = vi.fn();

  // The trigger is labelled with the basis currently in effect.
  const openPicker = async () => {
    renderPanel({ actions: { updateActiveJob } });
    await userEvent.click(screen.getByRole("button", { name: "Sell Orders" }));
  };

  const chooseOption = (label) =>
    userEvent.click(within(screen.getByRole("listbox")).getByText(label));

  beforeEach(() => {
    updateActiveJob.mockClear();
    useActiveJobReadOnly.mockReturnValue(false);
  });

  it("writes the chosen basis onto the job", async () => {
    await openPicker();

    await chooseOption("Buy Orders");

    expect(updateActiveJob).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({
          localPricing: expect.objectContaining({
            buying: expect.objectContaining({ basis: "buy" }),
          }),
        }),
      }),
    );
  });

  it("writes nothing when the basis chosen is the one already in effect", async () => {
    await openPicker();

    await chooseOption("Sell Orders");

    expect(updateActiveJob).not.toHaveBeenCalled();
  });

  // A job someone else holds is read from, not edited — every other panel on
  // the page gates its actions this way.
  it("cannot be changed on a job that is locked", () => {
    useActiveJobReadOnly.mockReturnValue(true);

    renderPanel({ actions: { updateActiveJob } });

    expect(screen.getByRole("button", { name: "Sell Orders" })).toBeDisabled();
  });
});

// The design pairs the basis with the hub: both decide what a row's buy figure
// is, and until now only one of them could be changed from the panel.
describe("choosing a hub", () => {
  it("writes the chosen hub onto the job", async () => {
    const updateActiveJob = vi.fn();
    renderPanel({ actions: { updateActiveJob } });

    const [hub] = screen.getAllByRole("combobox");
    await userEvent.click(hub);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText(/Amarr/i),
    );

    expect(updateActiveJob).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({
          localPricing: expect.objectContaining({
            buying: expect.objectContaining({ market: "amarr" }),
          }),
        }),
      }),
    );
  });
});

// The server refreshes on a period measured in hours, and a stale figure looks
// exactly as authoritative as a fresh one.
describe("how old the figures are", () => {
  it("states the age of the prices behind the totals", async () => {
    useMaterialsSourcingMock.mockReturnValueOnce({
      ...sourcing,
      priceAge: 90 * 60 * 1000,
    });

    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Sell Orders" }));

    expect(screen.getByText(/Server prices .* old/)).toBeInTheDocument();
  });

  it("says nothing where no price carries a timestamp", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Sell Orders" }));

    expect(screen.queryByText(/Server prices/)).not.toBeInTheDocument();
  });
});

// Deciding a material used to mean expanding its row to reach the control in the
// drawer, one row at a time. The panel puts that control on the row instead, so
// a list of costed rows can be settled from the list.
describe("deciding a row without expanding it", () => {
  it("gives every buildable row its own buy-or-build control", () => {
    renderPanel();

    expect(screen.getByTestId("plan-34")).toBeInTheDocument();
  });

  // The control acts on a job, and confirming a row with none behind it has
  // nothing to confirm.
  it("hands the control the job the row was costed with", () => {
    renderPanel({
      state: {
        ...state,
        speculativeChildJobs: { 34: { itemID: 34, jobID: "spec-1" } },
      },
    });

    expect(screen.getByTestId("plan-34")).toHaveTextContent("costed");
  });

  it("says so where the row has not been costed", () => {
    renderPanel();

    expect(screen.getByTestId("plan-34")).toHaveTextContent("uncosted");
  });

  // A row already building is confirmed against the job doing it, not against a
  // speculative one that was never made for it.
  it("falls back to the job already linked to the row", () => {
    useMaterialsSourcingMock.mockReturnValueOnce({
      ...sourcing,
      rows: [
        {
          ...sourcing.rows[0],
          plan: MATERIAL_PLAN.BUILD,
          matchedChildJobs: [{ itemID: 34, jobID: "linked-1" }],
        },
      ],
    });

    renderPanel();

    expect(screen.getByTestId("plan-34")).toHaveTextContent("costed");
  });

  // Nothing is built for a row with no blueprint, so there is no decision to
  // offer on it.
  it("offers no control on a row that cannot be built", () => {
    useMaterialsSourcingMock.mockReturnValueOnce({
      ...sourcing,
      rows: [{ ...sourcing.rows[0], isBuildable: false }],
    });

    renderPanel();

    expect(screen.queryByTestId("plan-34")).toBeNull();
  });
});
