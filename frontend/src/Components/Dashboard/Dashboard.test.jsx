import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

/** Stands in for the tutorial card, whose own fade-out is tested beside it. */
vi.mock("../Tutorials/tutorialTemplate", () => ({
  default: ({ onFadeOutComplete }) => (
    <button onClick={onFadeOutComplete}>finish the fade</button>
  ),
}));

const nothing = () => null;
vi.mock("./Components/AccountData", () => ({ AccountData: nothing }));
vi.mock("./Components/NewTransactions", () => ({ NewTransactions: nothing }));
vi.mock("../Archive Statistics/ArchivedStatsOverview", () => ({
  ArchivedStatsOverview: nothing,
}));
vi.mock("../Archive Statistics/ArchivedItemBreakdown", () => ({
  ArchivedItemBreakdown: nothing,
}));
vi.mock("./Components/dashboardTutorial", () => ({
  TutorialDashboard: nothing,
}));
vi.mock("./Components/ItemWatch/ItemWatchPanel", () => ({
  ItemWatchPanel: nothing,
}));
vi.mock("./Components/characterSlots", () => ({
  ActiveCharacterSlots: nothing,
}));
vi.mock("../Dialogues/Price History/dialogueFrame", () => ({
  default: nothing,
}));
vi.mock("../Dialogues/Market Data/dialogueFrame", () => ({ default: nothing }));
vi.mock("../Dialogues/Assets/dialogueFrame", () => ({ default: nothing }));

const { default: Dashboard } = await import("./Dashboard.jsx");

const theme = createTheme();

function reader({ isLoggedIn = true, displayHelpCards = true } = {}) {
  store.current = {
    account: { isLoggedIn },
    applicationSettings: { displayHelpCards },
  };
}

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <Dashboard />
    </ThemeProvider>,
  );
}

function again() {
  return (
    <ThemeProvider theme={theme}>
      <Dashboard />
    </ThemeProvider>
  );
}

function tutorialRow() {
  return screen.queryByRole("button", { name: "finish the fade" });
}

function finishTheFade() {
  fireEvent.click(tutorialRow());
}

beforeEach(() => {
  reader();
});

describe("the dashboard's tutorial row", () => {
  it("keeps a row for the tutorial when help is wanted", () => {
    show();

    expect(tutorialRow()).toBeInTheDocument();
  });

  it("keeps a row for anyone who is not signed in", () => {
    reader({ isLoggedIn: false, displayHelpCards: false });

    show();

    expect(tutorialRow()).toBeInTheDocument();
  });

  // The row outlives the card it holds: it is given up only once the card says
  // its fade has finished, so the panels below do not jump up mid-animation.
  it("keeps the row while the tutorial fades away", () => {
    const { rerender } = show();

    reader({ displayHelpCards: false });
    rerender(again());

    expect(tutorialRow()).toBeInTheDocument();
  });

  it("gives the row up once the tutorial says it has faded away", () => {
    const { rerender } = show();
    reader({ displayHelpCards: false });
    rerender(again());

    finishTheFade();

    expect(tutorialRow()).toBeNull();
  });

  it("takes the row back when help is turned on again", () => {
    const { rerender } = show();
    reader({ displayHelpCards: false });
    rerender(again());
    finishTheFade();

    reader({ displayHelpCards: true });
    rerender(again());

    expect(tutorialRow()).toBeInTheDocument();
  });
});
