import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import CorporationEsiSection from "./CorporationEsiSection";
import { testQueryClient } from "../../tests/queryClients.js";

let corporations = [];

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters: [],
        corporations,
        actions: { findCharacterByHash: () => null },
      },
    }),
  );
});

vi.mock("../../Functions/Auth/esiCredentials/provider.js", () => ({
  heldEsiAccessToken: () => "",
}));

function renderSection() {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CorporationEsiSection />
    </QueryClientProvider>,
  );
}

const HARD_KNOCKS = {
  corporation_id: 98000001,
  corporationName: "Hard Knocks Inc.",
  members: ["hash-1", "hash-2"],
};

describe("what is held for a corporation", () => {
  // A corporation's list comes back whole to any member holding the role, so two members of one
  // corporation share one set of rows rather than each carrying their own copy.
  it("draws one card per corporation, however many members are linked", async () => {
    const user = userEvent.setup();
    corporations = [HARD_KNOCKS];
    renderSection();

    expect(screen.getAllByText("Hard Knocks Inc.")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /esi data/i }));

    expect(screen.getAllByText("Corporation Blueprints")).toHaveLength(1);
  });

  it("holds each corporation's list back until it is opened", () => {
    corporations = [HARD_KNOCKS];
    renderSection();

    expect(
      screen.queryByText("Corporation Blueprints"),
    ).not.toBeInTheDocument();
  });

  it("draws nothing for an account in no corporation", () => {
    corporations = [];
    renderSection();

    expect(screen.queryByText("Corporation data")).not.toBeInTheDocument();
  });
});
