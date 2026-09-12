import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store, setUserWatchlist, setUserWatchlistGroups, putWatchlist } =
  vi.hoisted(() => ({
    store: { current: null },
    setUserWatchlist: vi.fn(),
    setUserWatchlistGroups: vi.fn(),
    putWatchlist: vi.fn(),
  }));

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock(
  "../../../../Functions/Endpoints/Private/watchlistDeprecated.js",
  () => ({ putWatchlistDeprecatedToApi: putWatchlist }),
);

const { GroupSettingsDialogue } = await import("./groupSettings.jsx");

const theme = createTheme();
const onClose = vi.fn();

function watchlist(groups, items = []) {
  store.current = {
    jobData: {
      userWatchlist: { groups, items },
      actions: { setUserWatchlist, setUserWatchlistGroups },
    },
  };
}

function show(group) {
  return render(
    <ThemeProvider theme={theme}>
      <GroupSettingsDialogue groupSettingsContent={group} onClose={onClose} />
    </ThemeProvider>,
  );
}

function nameField() {
  return screen.getByRole("textbox");
}

beforeEach(() => {
  vi.clearAllMocks();
  watchlist([{ id: 7, name: "Minerals" }]);
});

describe("a watchlist group's settings", () => {
  // It is built when the reader opens it, so it opens on that group's name
  // without having to be told the name changed.
  it("opens on the name of the group it was given", () => {
    show({ id: 7, name: "Minerals" });

    expect(nameField()).toHaveValue("Minerals");
  });

  it("opens on the other group's name the next time", () => {
    watchlist([
      { id: 7, name: "Minerals" },
      { id: 8, name: "Salvage" },
    ]);
    const { unmount } = show({ id: 7, name: "Minerals" });
    unmount();

    show({ id: 8, name: "Salvage" });

    expect(nameField()).toHaveValue("Salvage");
  });

  it("saves the new name and closes", async () => {
    show({ id: 7, name: "Minerals" });

    fireEvent.change(nameField(), { target: { value: "Ore" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(setUserWatchlistGroups).toHaveBeenCalledWith([
      expect.objectContaining({ id: 7, name: "Ore" }),
    ]);
    expect(putWatchlist).toHaveBeenCalled();
  });

  it("strips markup out of the name", async () => {
    show({ id: 7, name: "Minerals" });

    fireEvent.change(nameField(), {
      target: { value: "<img src=x onerror=alert(1)>Ore" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setUserWatchlistGroups).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Ore" }),
      ]),
    );
  });

  // Items in a deleted group are not deleted with it — they go back to being
  // ungrouped.
  it("puts the group's items back in the ungrouped list when it is deleted", async () => {
    watchlist(
      [{ id: 7, name: "Minerals" }],
      [
        { id: "item-1", group: 7 },
        { id: "item-2", group: 0 },
      ],
    );
    show({ id: 7, name: "Minerals" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [items, groups] = setUserWatchlist.mock.calls.at(-1);
    expect(groups).toEqual([]);
    expect(items.every((item) => item.group === 0)).toBe(true);
  });
});
