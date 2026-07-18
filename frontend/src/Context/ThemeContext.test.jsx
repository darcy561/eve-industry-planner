import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { blue, green, lightGreen } from "@mui/material/colors";
import { useTheme } from "@mui/material/styles";
import GLOBAL_CONFIG from "../global-config-app";

const { responsiveFontSizesMock } = vi.hoisted(() => ({
  responsiveFontSizesMock: vi.fn((theme) => theme),
}));

vi.mock("@mui/material/styles", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    responsiveFontSizes: (...args) => responsiveFontSizesMock(...args),
  };
});

import {
  ThemeProvider,
  resolveInitialThemeMode,
  themeStorage,
  useThemeContext,
} from "./ThemeContext";

const { PRIMARY_THEME, SECONDARY_THEME } = GLOBAL_CONFIG;

function ThemeProbe() {
  const { mode, toggleColorMode } = useThemeContext();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={toggleColorMode}>
        toggle
      </button>
    </div>
  );
}

function PaletteProbe() {
  const theme = useTheme();
  return (
    <div>
      <span data-testid="palette-mode">{theme.palette.mode}</span>
      <span data-testid="primary">
        {theme.palette.primary.main}
      </span>
      <span data-testid="manufacturing">
        {theme.palette.manufacturing.main}
      </span>
      <span data-testid="scrollbar-thumb">
        {
          theme.components.MuiCssBaseline.styleOverrides["*"][
            "&::-webkit-scrollbar-thumb"
          ].backgroundColor
        }
      </span>
    </div>
  );
}

function createMatchMediaMock({ matches = false } = {}) {
  const listeners = new Set();
  const mediaQuery = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((event, handler) => {
      if (event === "change") {
        listeners.add(handler);
      }
    }),
    removeEventListener: vi.fn((event, handler) => {
      if (event === "change") {
        listeners.delete(handler);
      }
    }),
    dispatchEvent: vi.fn(),
    trigger(nextMatches) {
      mediaQuery.matches = nextMatches;
      listeners.forEach((handler) => handler({ matches: nextMatches }));
    },
  };

  window.matchMedia = vi.fn().mockReturnValue(mediaQuery);
  return mediaQuery;
}

describe("themeStorage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reads and writes theme values", () => {
    themeStorage.setItem("theme", PRIMARY_THEME);
    expect(themeStorage.getItem("theme")).toBe(PRIMARY_THEME);
  });

  it("returns null when localStorage is null", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => null,
    });

    expect(themeStorage.getItem("theme")).toBeNull();
    expect(() => themeStorage.setItem("theme", PRIMARY_THEME)).not.toThrow();

    Object.defineProperty(window, "localStorage", descriptor);
  });

  it("returns null when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(themeStorage.getItem("theme")).toBeNull();
  });

  it("swallows setItem errors", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => themeStorage.setItem("theme", PRIMARY_THEME)).not.toThrow();
  });
});

describe("resolveInitialThemeMode", () => {
  it("returns primary when window is unavailable", () => {
    expect(resolveInitialThemeMode(null, true, false)).toBe(PRIMARY_THEME);
    expect(resolveInitialThemeMode(SECONDARY_THEME, false, false)).toBe(
      PRIMARY_THEME
    );
  });

  it("prefers a stored theme over system preference", () => {
    expect(resolveInitialThemeMode(SECONDARY_THEME, true)).toBe(
      SECONDARY_THEME
    );
    expect(resolveInitialThemeMode(PRIMARY_THEME, false)).toBe(PRIMARY_THEME);
  });

  it("uses system preference when nothing is stored", () => {
    expect(resolveInitialThemeMode(null, true)).toBe(PRIMARY_THEME);
    expect(resolveInitialThemeMode(null, false)).toBe(SECONDARY_THEME);
    expect(resolveInitialThemeMode("", false)).toBe(SECONDARY_THEME);
  });
});

describe("ThemeProvider", () => {
  let mediaQuery;

  beforeEach(() => {
    localStorage.clear();
    responsiveFontSizesMock.mockReset();
    responsiveFontSizesMock.mockImplementation((theme) => theme);
    mediaQuery = createMatchMediaMock({ matches: false });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the stored theme when available", () => {
    localStorage.setItem("theme", SECONDARY_THEME);

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mode")).toHaveTextContent(SECONDARY_THEME);
  });

  it("falls back to dark system preference when nothing is stored", () => {
    mediaQuery = createMatchMediaMock({ matches: true });

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mode")).toHaveTextContent(PRIMARY_THEME);
  });

  it("falls back to light system preference when nothing is stored", () => {
    mediaQuery = createMatchMediaMock({ matches: false });

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mode")).toHaveTextContent(SECONDARY_THEME);
  });

  it("does not crash when localStorage is null", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => null,
    });

    expect(() =>
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>
      )
    ).not.toThrow();

    expect(screen.getByTestId("mode")).toBeInTheDocument();

    Object.defineProperty(window, "localStorage", descriptor);
  });

  it("persists the initial mode to localStorage", () => {
    mediaQuery = createMatchMediaMock({ matches: true });

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(localStorage.getItem("theme")).toBe(PRIMARY_THEME);
  });

  it("toggles between primary and secondary themes", async () => {
    const user = userEvent.setup();
    localStorage.setItem("theme", PRIMARY_THEME);

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mode")).toHaveTextContent(PRIMARY_THEME);
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("mode")).toHaveTextContent(SECONDARY_THEME);
    expect(localStorage.getItem("theme")).toBe(SECONDARY_THEME);

    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("mode")).toHaveTextContent(PRIMARY_THEME);
    expect(localStorage.getItem("theme")).toBe(PRIMARY_THEME);
  });

  it("ignores system preference changes when a theme is stored", () => {
    localStorage.setItem("theme", SECONDARY_THEME);

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mode")).toHaveTextContent(SECONDARY_THEME);

    act(() => {
      mediaQuery.trigger(true);
    });

    expect(screen.getByTestId("mode")).toHaveTextContent(SECONDARY_THEME);
  });

  it("follows system preference changes when storage is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => null,
    });
    mediaQuery = createMatchMediaMock({ matches: false });

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("mode")).toHaveTextContent(SECONDARY_THEME);

    act(() => {
      mediaQuery.trigger(true);
    });
    expect(screen.getByTestId("mode")).toHaveTextContent(PRIMARY_THEME);

    act(() => {
      mediaQuery.trigger(false);
    });
    expect(screen.getByTestId("mode")).toHaveTextContent(SECONDARY_THEME);

    Object.defineProperty(window, "localStorage", descriptor);
  });

  it("registers and cleans up the system preference listener", () => {
    const { unmount } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(mediaQuery.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
    const handler = mediaQuery.addEventListener.mock.calls[0][1];

    unmount();

    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      handler
    );
  });

  it("builds dark palette and scrollbar tokens", () => {
    localStorage.setItem("theme", PRIMARY_THEME);

    render(
      <ThemeProvider>
        <PaletteProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("palette-mode")).toHaveTextContent(PRIMARY_THEME);
    expect(screen.getByTestId("primary")).toHaveTextContent(blue[800]);
    expect(screen.getByTestId("manufacturing")).toHaveTextContent(green[600]);
    expect(screen.getByTestId("scrollbar-thumb")).toHaveTextContent(
      "rgba(255, 255, 255, 0.2)"
    );
  });

  it("builds light palette and scrollbar tokens", () => {
    localStorage.setItem("theme", SECONDARY_THEME);

    render(
      <ThemeProvider>
        <PaletteProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("palette-mode")).toHaveTextContent(
      SECONDARY_THEME
    );
    expect(screen.getByTestId("primary")).toHaveTextContent(blue[600]);
    expect(screen.getByTestId("manufacturing")).toHaveTextContent(
      lightGreen[200]
    );
    expect(screen.getByTestId("scrollbar-thumb")).toHaveTextContent(
      "rgba(0, 0, 0, 0.2)"
    );
  });

  it("falls back to a basic theme when responsiveFontSizes fails", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    responsiveFontSizesMock.mockImplementation(() => {
      throw new Error("theme build failed");
    });
    localStorage.setItem("theme", PRIMARY_THEME);

    function BasicPaletteProbe() {
      const theme = useTheme();
      return <span data-testid="palette-mode">{theme.palette.mode}</span>;
    }

    render(
      <ThemeProvider>
        <BasicPaletteProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("palette-mode")).toHaveTextContent(PRIMARY_THEME);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

describe("useThemeContext", () => {
  it("throws when used outside ThemeProvider", () => {
    expect(() => renderHook(() => useThemeContext())).toThrow(
      /useThemeContext must be used within a ThemeProvider/
    );
  });
});
