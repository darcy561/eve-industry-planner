import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

const { default: CharacterSelection } =
  await import("./CharacterSelection.jsx");

const theme = createTheme();

function character(hash, name) {
  return { CharacterHash: hash, CharacterName: name };
}

/** The store hands characters over as a record, rebuilt whenever it is written. */
function holding(...characters) {
  store.current = {
    account: {
      characters: Object.fromEntries(
        characters.map((c) => [c.CharacterHash, c]),
      ),
    },
  };
}

function show(onSelectionChange = () => {}) {
  return render(
    <ThemeProvider theme={theme}>
      <CharacterSelection onSelectionChange={onSelectionChange} />
    </ThemeProvider>,
  );
}

function again(onSelectionChange = () => {}) {
  return (
    <ThemeProvider theme={theme}>
      <CharacterSelection onSelectionChange={onSelectionChange} />
    </ThemeProvider>
  );
}

function ticked() {
  // Nothing is drawn at all before the characters arrive, so this has to cope
  // with there being no boxes rather than no ticks.
  return screen.queryAllByRole("checkbox").filter((box) => box.checked).length;
}

function deselectAll() {
  // The two header buttons carry icons and no name; deselect is the second.
  fireEvent.click(screen.getAllByRole("button")[1]);
}

function selectAll() {
  fireEvent.click(screen.getAllByRole("button")[0]);
}

beforeEach(() => {
  holding(character("hash-a", "Alpha"), character("hash-b", "Bravo"));
});

describe("choosing which characters the scheduler plans for", () => {
  it("starts with everyone chosen", () => {
    show();

    expect(ticked()).toBe(2);
  });

  it("chooses everyone once the characters arrive", () => {
    store.current = { account: { characters: {} } };
    const { rerender } = show();
    expect(ticked()).toBe(0);

    holding(character("hash-a", "Alpha"), character("hash-b", "Bravo"));
    rerender(again());

    expect(ticked()).toBe(2);
  });

  it("leaves the rest alone when one is taken out", () => {
    show();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(ticked()).toBe(1);
  });

  it("takes everyone out at once", () => {
    show();

    deselectAll();

    expect(ticked()).toBe(0);
  });

  it("puts everyone back at once", () => {
    show();
    deselectAll();

    selectAll();

    expect(ticked()).toBe(2);
  });

  // The defect this covers: nobody chosen is a choice the reader can make, and
  // it used to read as "not set up yet" — so the next time anything rewrote the
  // characters in the store, everyone came back and the schedule was planned
  // for all of them.
  it("keeps nobody chosen when the characters are written again", () => {
    const { rerender } = show();
    deselectAll();
    expect(ticked()).toBe(0);

    holding(character("hash-a", "Alpha"), character("hash-b", "Bravo"));
    rerender(again());

    expect(ticked()).toBe(0);
  });

  it("does not tell the scheduler everyone is back", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = show(onSelectionChange);
    deselectAll();
    onSelectionChange.mockClear();

    holding(character("hash-a", "Alpha"), character("hash-b", "Bravo"));
    rerender(again(onSelectionChange));

    for (const [rows] of onSelectionChange.mock.calls) {
      expect(rows).toEqual([]);
    }
  });

  it("leaves a character added later unchosen", () => {
    const { rerender } = show();

    holding(
      character("hash-a", "Alpha"),
      character("hash-b", "Bravo"),
      character("hash-c", "Charlie"),
    );
    rerender(again());

    expect(ticked()).toBe(2);
  });

  it("hands the scheduler the characters that are chosen", () => {
    const onSelectionChange = vi.fn();
    show(onSelectionChange);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    const rows = onSelectionChange.mock.calls.at(-1)[0];
    expect(rows.map((c) => c.CharacterHash)).toEqual(["hash-b"]);
  });
});
