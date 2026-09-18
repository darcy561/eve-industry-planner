import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { CorporationsPanel } from "./CorporationsPanel";
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

function renderPanel() {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <CorporationsPanel />
    </QueryClientProvider>,
  );
}

describe("the corporations an account's characters are in", () => {
  beforeEach(() => {
    corporations = [
      {
        corporation_id: 98000001,
        corporationName: "Hard Knocks Inc.",
        members: ["hash-1"],
      },
    ];
  });

  it("is a section of the page, with a row per corporation", () => {
    renderPanel();

    expect(screen.getByText("Corporations")).toBeInTheDocument();
    expect(screen.getByText("Hard Knocks Inc.")).toBeInTheDocument();
  });

  // An account whose characters are in no corporation should not meet an empty heading.
  it("draws no section at all when there are none", () => {
    corporations = [];
    renderPanel();

    expect(screen.queryByText("Corporations")).not.toBeInTheDocument();
  });
});
