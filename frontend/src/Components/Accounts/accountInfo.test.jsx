import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AccountInfo } from "./accountInfo";

let characters = [];
let accountID = "acc-1";
let mainCharacterName = "Oswold Saraki";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters,
        actions: {
          getAccountID: () => accountID,
          getMainCharacterName: () => mainCharacterName,
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
      },
    ];
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
});
