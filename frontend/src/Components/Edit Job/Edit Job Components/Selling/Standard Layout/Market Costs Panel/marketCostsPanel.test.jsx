import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

vi.mock("../../../../../../Hooks/Static/useMarketSources", () => ({
  useMarketSources: () => [{ id: "jita", name: "Jita" }],
}));

vi.mock("../../../../../../Functions/MarketData/marketPriceForType", () => ({
  getMarketPriceForType: (typeID, _source, side) =>
    side === "sell" ? typeID * 2 : typeID,
}));

vi.mock("../../../../../../Styled Components/Item/marketActions", () => ({
  default: ({ typeID }) => <span>actions for {typeID}</span>,
}));

const { MarketCostsPanel } = await import("./marketCostsPanel.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const theme = createTheme();
const session = () => useUsersStore.getState().editSession;

const openJob = () =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    itemID: 587,
    build: {},
  });

const show = (Panel = MarketCostsPanel) =>
  render(
    <ThemeProvider theme={theme}>
      <Panel />
    </ThemeProvider>,
  );

beforeEach(() => {
  session().actions.closeSession();
  openJob();
});

describe("what the item sells for at each market", () => {
  it("prices the item the job makes", () => {
    show();

    expect(screen.getByText("Sell: 1,174.00")).toBeInTheDocument();
    expect(screen.getByText("Buy: 587.00")).toBeInTheDocument();
    expect(screen.getByText("actions for 587")).toBeInTheDocument();
  });

  it("is not re-rendered by a change to the rest of the job", async () => {
    const renders = renderCounts();
    show(renders.watch("marketCosts", MarketCostsPanel));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("marketCosts")).toBe(0);
  });
});
