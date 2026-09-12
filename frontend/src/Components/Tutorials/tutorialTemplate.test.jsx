import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store, toggleHideTutorials, scheduleSave } = vi.hoisted(() => ({
  store: { current: null },
  toggleHideTutorials: vi.fn(),
  scheduleSave: vi.fn(),
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedApplicationSettingsSave: scheduleSave,
}));

const { default: TutorialTemplate } = await import("./tutorialTemplate.jsx");

const theme = createTheme();

function reader({ isLoggedIn = true, displayHelpCards = true } = {}) {
  store.current = {
    account: { isLoggedIn },
    applicationSettings: {
      displayHelpCards,
      actions: { toggleHideTutorials },
    },
  };
}

function show(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <TutorialTemplate
        TutorialContent={<p>How this page works</p>}
        {...props}
      />
    </ThemeProvider>,
  );
}

function again(props = {}) {
  return (
    <ThemeProvider theme={theme}>
      <TutorialTemplate
        TutorialContent={<p>How this page works</p>}
        {...props}
      />
    </ThemeProvider>
  );
}

function tutorial() {
  return screen.queryByText("How this page works");
}

/** The card fades out over a second before it stops taking up room. */
function waitForTheFade() {
  act(() => vi.advanceTimersByTime(1100));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  reader();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the tutorial card", () => {
  it("shows the tutorial to a reader who wants help", () => {
    show();

    expect(tutorial()).toBeInTheDocument();
  });

  it("shows nothing to a reader who has turned tutorials off", () => {
    reader({ displayHelpCards: false });

    const { container } = show();

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the tutorial to anyone who is not signed in", () => {
    reader({ isLoggedIn: false, displayHelpCards: false });

    show();

    expect(tutorial()).toBeInTheDocument();
  });

  it("offers the hide switch only to a signed-in reader", () => {
    reader({ isLoggedIn: false, displayHelpCards: false });
    const { rerender } = show();
    expect(screen.queryByLabelText("Hide Tutorials")).toBeNull();

    reader();
    rerender(again());

    expect(screen.getByLabelText("Hide Tutorials")).toBeInTheDocument();
  });

  it("remembers the choice when the hide switch is used", () => {
    show();

    fireEvent.click(screen.getByLabelText("Hide Tutorials"));

    expect(toggleHideTutorials).toHaveBeenCalled();
    expect(scheduleSave).toHaveBeenCalled();
  });

  it("closes the menu it was opened from when the switch is used", () => {
    const updateExpandedMenu = vi.fn();
    show({ updateExpandedMenu });

    fireEvent.click(screen.getByLabelText("Hide Tutorials"));

    expect(updateExpandedMenu).toHaveBeenCalled();
  });

  it("keeps the tutorial on screen while it fades away", () => {
    const { rerender } = show();

    reader({ displayHelpCards: false });
    rerender(again());

    expect(tutorial()).toBeInTheDocument();
  });

  it("takes the tutorial away once the fade has finished", () => {
    const { rerender } = show();

    reader({ displayHelpCards: false });
    rerender(again());
    waitForTheFade();

    expect(tutorial()).toBeNull();
  });

  it("tells the page it has gone once the fade has finished", () => {
    const onFadeOutComplete = vi.fn();
    const { rerender } = show({ onFadeOutComplete });

    reader({ displayHelpCards: false });
    rerender(again({ onFadeOutComplete }));
    expect(onFadeOutComplete).not.toHaveBeenCalled();
    waitForTheFade();

    expect(onFadeOutComplete).toHaveBeenCalledTimes(1);
  });

  it("brings the tutorial back when help is turned on again", () => {
    const { rerender } = show();
    reader({ displayHelpCards: false });
    rerender(again());
    waitForTheFade();

    reader();
    rerender(again());

    expect(tutorial()).toBeInTheDocument();
  });
});
