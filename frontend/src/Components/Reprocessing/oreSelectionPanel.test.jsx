import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../tests/queryClients.js";
import { seedItemRecords } from "../../tests/seedItems.js";
import {
  compressedOreChoices,
  defaultPlannerReprocessingSettings,
  shippingModes,
} from "../../Context/defaultValues";
import OreSelectionPanel from "./oreSelectionPanel.jsx";

function show({ settings = {}, isPlannerHeld = true } = {}) {
  const queryClient = testQueryClient();
  seedItemRecords(queryClient, { 1230: "Veldspar" });
  const actions = {
    changeSettings: vi.fn(),
    allowAgain: vi.fn(),
  };
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={createTheme()}>
        <OreSelectionPanel
          settings={{ ...defaultPlannerReprocessingSettings(), ...settings }}
          isPlannerHeld={isPlannerHeld}
          actions={actions}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return actions;
}

describe("the ore selection panel", () => {
  it("says it saves to the planner only when there is one", () => {
    show();
    expect(screen.getByText("Saved to this planner")).toBeInTheDocument();
  });

  it("says nothing of saving with no planner", () => {
    show({ isPlannerHeld: false });
    expect(screen.queryByText("Saved to this planner")).toBeNull();
  });

  it("charges shipping as a fixed amount once chosen", async () => {
    const actions = show();

    await userEvent.click(screen.getByRole("button", { name: "Fixed amount" }));

    expect(actions.changeSettings).toHaveBeenCalledWith({
      shipping: { mode: shippingModes.fixed, amount: 0 },
    });
  });

  it("leaves compressed ore out when told not to use it", async () => {
    const actions = show();

    await userEvent.click(screen.getByRole("button", { name: "Don't use" }));

    expect(actions.changeSettings).toHaveBeenCalledWith({
      compressedOre: compressedOreChoices.avoid,
    });
  });

  it("buys minerals outright once switched on", async () => {
    const actions = show();

    await userEvent.click(
      screen.getByRole("switch", {
        name: "Buy minerals outright where cheaper",
      }),
    );

    expect(actions.changeSettings).toHaveBeenCalledWith({ buyOutright: true });
  });

  it("allows an ore it was told never to choose again", async () => {
    const actions = show({ settings: { neverChoose: [1230] } });

    await userEvent.click(screen.getByLabelText("Allow Veldspar again"));

    expect(actions.allowAgain).toHaveBeenCalledWith(1230);
  });
});
