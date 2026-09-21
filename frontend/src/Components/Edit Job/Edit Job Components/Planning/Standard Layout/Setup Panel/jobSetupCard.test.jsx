import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  setupFixture,
  TRITANIUM,
} from "../../../../../../tests/editJobFixtures.js";
import seedPrices from "../../../../../../tests/seedPrices.js";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    applicationSettings: {
      actions: { findPredefinedSystemIndex: () => undefined },
    },
    // The system's own index, as the planner holds it: what the estimate is
    // scaled by once the materials have been priced.
    worldData: {
      actions: { findSystemIndex: () => ({ manufacturing: 0.05 }) },
    },
  });
});

vi.mock("../../../../../../Hooks/useSolarSystemNames", () => ({
  useSolarSystemName: () => "Jita",
}));

const { JobSetupCard } = await import("./jobSetupCard.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

// The card colours its border by job type, which the app's palette carries a
// key for and a bare theme does not.
const theme = createTheme({ palette: { manufacturing: { main: "#123456" } } });
const session = () => useUsersStore.getState().editSession;

/** A setup as the job stores it — plain data, not an instance of the class. */
const storedSetup = () => ({
  ...setupFixture("setup-1"),
  materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity: 1000 } },
});

const openJob = (setupToEdit = null) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    build: { setup: { "setup-1": storedSetup() } },
    layout: { setupToEdit },
  });

const show = (setupEntry = storedSetup()) =>
  render(
    <ThemeProvider theme={theme}>
      <JobSetupCard setupEntry={setupEntry} />
    </ThemeProvider>,
  );

beforeEach(() => {
  session().actions.closeSession();
  openJob();
});

describe("a card for one of the job's setups", () => {
  // The estimate is worked out from the setup as the job stores it. Read
  // through anything that insists on the class instead, every card on the page
  // quietly prices the build at nothing.
  it("prices installing the setup from what it consumes", () => {
    seedPrices({}, { adjusted: { [TRITANIUM]: 500 } });

    show();

    // A figure rather than "not zero": 1,000 units at an adjusted 500 make a
    // 500,000 estimate, and what the system index, the facility tax and the
    // surcharge make of that is the charge. Read loosely, a NaN would pass.
    expect(screen.getByText(/Est Total Install Costs:/).textContent).toBe(
      "Est Total Install Costs: 46,250.00",
    );
  });

  it("asks for the setup to be the one being edited when it is pressed", () => {
    show();

    fireEvent.click(screen.getByRole("button"));

    expect(session().draft.log.map((entry) => entry.command)).toEqual([
      "change the view",
    ]);
  });
});
