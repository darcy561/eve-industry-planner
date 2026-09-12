import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({
    data: { 34: { name: "Veldspar" } },
    isLoading: false,
  }),
}));

vi.mock("../../Events/snackbarEvents", () => ({
  showSnackbarSuccess: () => {},
  showSnackbarError: () => {},
}));

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedApplicationSettingsSave: () => {},
}));

const { default: ReprocessingSettingsPanel } =
  await import("./reprocessingSettingsPanel.jsx");

const theme = createTheme();

function show({ exempt = [] } = {}) {
  return render(
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
    </ThemeProvider>,
  );
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
    const { rerender } = show({ exempt: [] });
    expect(isOpen()).toBe(false);

    rerender(
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
      </ThemeProvider>,
    );

    expect(isOpen()).toBe(true);
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
