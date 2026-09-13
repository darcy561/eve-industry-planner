import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { seedItemRecords } from "../../tests/seedItems";
import { testQueryClient } from "../../tests/queryClients.js";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedApplicationSettingsSave: () => {},
}));

const { default: ReprocessingSettingsPanel } =
  await import("./reprocessingSettingsPanel.jsx");

const theme = createTheme();

function show({ exempt = [], items = { 34: "Veldspar" } } = {}) {
  // No retries: the unseeded case is the panel drawing before the file arrives, and a client that
  // retried the real fetch would sit there rather than render that state.
  const queryClient = testQueryClient();
  if (items) seedItemRecords(queryClient, items);

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <ReprocessingSettingsPanel
            pageState={{
              oreIDsToBeIgnored: exempt,
              reprocessingCalculationSettings: {},
            }}
            pageActions={{
              setReprocessingCalculationSettings: () => {},
              setOreIDsToBeIgnored: () => {},
            }}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    ),
  };
}

/**
 * The body stays mounted while it is shut, so what it holds says nothing about
 * whether it is open. The expander does: it offers the way it can be moved.
 */
function isOpen() {
  return screen.queryByTestId("ExpandLessIcon") !== null;
}

beforeEach(() => {
  store.current = {
    account: { isLoggedIn: true },
    applicationSettings: {
      actions: { updateReprocessingSettings: () => {} },
    },
  };
});

describe("the reprocessing settings panel", () => {
  it("starts shut when nothing is exempt", () => {
    show({ exempt: [] });

    expect(isOpen()).toBe(false);
  });

  // Something already exempt is the reason to look, so the panel opens on it
  // rather than hiding a list the reader came for.
  it("starts open when something is already exempt", () => {
    show({ exempt: [34] });

    expect(isOpen()).toBe(true);
  });

  it("opens when something becomes exempt", () => {
    const { rerender, queryClient } = show({ exempt: [] });
    expect(isOpen()).toBe(false);

    rerender(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <ReprocessingSettingsPanel
            pageState={{
              oreIDsToBeIgnored: [34],
              reprocessingCalculationSettings: {},
            }}
            pageActions={{
              setReprocessingCalculationSettings: () => {},
              setOreIDsToBeIgnored: () => {},
            }}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(isOpen()).toBe(true);
  });

  it("names each exempt ore", () => {
    show({ exempt: [34] });

    expect(screen.getByText("Veldspar")).toBeInTheDocument();
  });

  // The list is settings data and arrives before the static file does, so an id with no record yet
  // has to read as something rather than as an empty pill.
  it("still labels an exempt ore before the item list arrives", () => {
    show({ exempt: [34], items: null });

    expect(screen.getByText("Unknown Item - 34")).toBeInTheDocument();
  });

  it("can be shut by the reader", () => {
    show({ exempt: [34] });
    expect(isOpen()).toBe(true);

    // The header's expander carries an icon and no name of its own, so it is
    // reached by position rather than by what it says.
    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(isOpen()).toBe(false);
  });
});
