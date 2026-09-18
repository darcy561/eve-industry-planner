import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act } from "react";

import { useQueryCacheRevision } from "./useQueryCacheRevision";
import { testQueryClient } from "../../tests/queryClients.js";

function CacheReader() {
  const queryClient = useQueryClient();
  useQueryCacheRevision(queryClient);
  const held = queryClient.getQueryData(["characterSkills", "hash-1"]);
  return <p>{held ? `held ${held.length}` : "nothing held"}</p>;
}

describe("reading the query cache directly", () => {
  // Without the subscription the reader keeps whatever the cache held on its first render, so a
  // prefetch finishing a moment later never reaches the screen.
  it("shows what arrives after the first render", async () => {
    const queryClient = testQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CacheReader />
      </QueryClientProvider>,
    );

    expect(screen.getByText("nothing held")).toBeInTheDocument();

    await act(async () => {
      queryClient.setQueryData(["characterSkills", "hash-1"], ["a skill"]);
    });

    expect(screen.getByText("held 1")).toBeInTheDocument();
  });
});
