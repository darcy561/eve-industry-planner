import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccountInfo } from "./accountInfo";

let characters = [];
let corporations = [];
let alliances = [];
let accountID = "acc-1";
let mainCharacterName = "Oswold Saraki";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters,
        corporations,
        alliances,
        actions: {
          getAccountID: () => accountID,
          getMainCharacterName: () => mainCharacterName,
          getCorporation: (id) =>
            corporations.find((c) => Number(c.corporation_id) === Number(id)) ??
            null,
        },
      },
    }),
  );
});

describe("the account a reader is signed in as", () => {
  beforeEach(() => {
    accountID = "acc-1";
    mainCharacterName = "Oswold Saraki";
    characters = [
      {
        CharacterID: 2114794365,
        CharacterName: "Oswold Saraki",
        isMainCharacter: true,
        corporation_id: 98000001,
      },
    ];
    corporations = [
      {
        corporation_id: 98000001,
        corporationName: "Hard Knocks Inc.",
        alliance_id: 99005338,
      },
    ];
    alliances = [{ alliance_id: 99005338, allianceName: "Pandemic Horde" }];
  });

  it("names the main character and shows its portrait", () => {
    render(<AccountInfo />);

    expect(screen.getByText("Oswold Saraki")).toBeInTheDocument();
    expect(screen.getByAltText("Oswold Saraki portrait")).toBeInTheDocument();
  });

  it("shows the account id", () => {
    render(<AccountInfo />);

    expect(screen.getByText("Account ID")).toBeInTheDocument();
    expect(screen.getByText("acc-1")).toBeInTheDocument();
  });

  it("falls back to the stored name when no character is marked main", () => {
    characters = [];
    render(<AccountInfo />);

    expect(screen.getByText("Oswold Saraki")).toBeInTheDocument();
  });

  it("reads as unknown rather than blank when there is no account id", () => {
    accountID = null;
    render(<AccountInfo />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // What the sections below already list is not worth repeating here; who this character flies
  // for is not stated anywhere else on the page.
  it("says who the main character flies for", () => {
    render(<AccountInfo />);

    expect(screen.getByText("Hard Knocks Inc.")).toBeInTheDocument();
    expect(screen.getByText("Pandemic Horde")).toBeInTheDocument();
    expect(screen.getByAltText("Hard Knocks Inc. logo")).toBeInTheDocument();
    expect(screen.getByAltText("Pandemic Horde logo")).toBeInTheDocument();
  });

  it("names no alliance for a corporation in none", () => {
    corporations = [
      { corporation_id: 98000001, corporationName: "Hard Knocks Inc." },
    ];
    render(<AccountInfo />);

    expect(screen.getByText("Hard Knocks Inc.")).toBeInTheDocument();
    expect(screen.queryByText("Pandemic Horde")).not.toBeInTheDocument();
  });

  // A character whose corporation the account has not built yet still has a line that reads.
  it("says so when the corporation is not known", () => {
    corporations = [];
    render(<AccountInfo />);

    expect(screen.getByText("No corporation")).toBeInTheDocument();
  });

  // A 36-character identifier exists to be quoted somewhere else, and selecting it by hand out of
  // a monospace run is the only thing a reader could otherwise do with it.
  it("copies the account id on request", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<AccountInfo />);

    await user.click(screen.getByRole("button", { name: /copy account id/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("acc-1");
    });
    vi.unstubAllGlobals();
  });

  it("offers nothing to copy when there is no account id", () => {
    accountID = null;
    render(<AccountInfo />);

    expect(
      screen.queryByRole("button", { name: /copy account id/i }),
    ).not.toBeInTheDocument();
  });

  // The page introduces an account; what linking a character does is first login's business, and
  // an explanation nobody opens is not worth the control that opens it.
  it("says what the account is without a paragraph about linking", () => {
    render(<AccountInfo />);

    expect(
      screen.queryByText(/primary login character/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /what linking characters does/i }),
    ).not.toBeInTheDocument();
  });
});
