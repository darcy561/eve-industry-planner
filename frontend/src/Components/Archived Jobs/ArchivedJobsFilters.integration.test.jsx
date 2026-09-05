import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, setViewportWide } from "../../../tests/archiveHarness.jsx";

/**
 * Searching, sorting and paging the archive.
 *
 * All three are server-side: the list draws the page it was handed, so what
 * matters is the request each control produces. Paging in particular is
 * arithmetic — an off-by-one page turns into an off-by-a-page offset, which
 * looks like missing jobs rather than a broken control.
 */

const getArchivedJobs = vi.fn();

vi.mock("../../Functions/Endpoints/Private/archivedJobsList", async () => {
  const { emptyArchiveListMock } = await import("../../../tests/archiveHarness.jsx");
  return { ...emptyArchiveListMock(), getArchivedJobs: (...args) => getArchivedJobs(...args) };
});
vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, archiveStoreState } = await import(
    "../../../tests/archiveHarness.jsx"
  );
  return usersStoreMock(archiveStoreState());
});

const { ArchivedJobsList } = await import("./ArchivedJobsList.jsx");

function job(jobID, name) {
  return {
    jobID,
    name,
    archivedAt: "2026-08-21T00:00:00Z",
    measures: { jobCostTotal: 1000, profitLoss: 250, segment: "standaloneRecordedSale" },
  };
}

/** A page that claims more jobs than it holds, so the pager has pages to offer. */
function pageOf(jobs, totalJobs = jobs.length) {
  return { jobs, paging: { totalJobs } };
}

function lastRequest() {
  const calls = getArchivedJobs.mock.calls;
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  getArchivedJobs.mockResolvedValue(pageOf([job("job-1", "Rifter")], 200));
  setViewportWide(true);
});

describe("filtering and paging the archive", () => {
  it("opens on the first page, newest first", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);
    await screen.findByText("Rifter");

    expect(lastRequest()).toMatchObject({ sort: "archivedAt", offset: 0 });
    // No search term is an absent filter rather than an empty one, which the
    // endpoint would refuse to parse.
    expect(lastRequest().search).toBeUndefined();
  });

  it("sends a search term the server filters on", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);
    await screen.findByText("Rifter");

    fireEvent.change(screen.getByLabelText("Search by name"), {
      target: { value: "hobgoblin" },
    });

    await waitFor(() => expect(lastRequest().search).toBe("hobgoblin"));
  });

  // Whitespace is not a filter: sending it would ask the server for names
  // containing a space and return nothing.
  it("treats a blank search as no search", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);
    await screen.findByText("Rifter");

    fireEvent.change(screen.getByLabelText("Search by name"), {
      target: { value: "   " },
    });

    await waitFor(() => expect(getArchivedJobs).toHaveBeenCalled());
    expect(lastRequest().search).toBeUndefined();
  });

  it("asks the server to re-sort rather than sorting the page it holds", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);
    await screen.findByText("Rifter");

    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByText("Name"));

    await waitFor(() => expect(lastRequest().sort).toBe("name"));
  });

  it("turns a page by moving the offset, not by asking for more rows", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);
    await screen.findByText("Rifter");
    const { limit } = lastRequest();

    fireEvent.click(await screen.findByRole("button", { name: "Go to page 2" }));

    await waitFor(() => expect(lastRequest().offset).toBe(limit));
    expect(lastRequest().limit).toBe(limit);
  });

  // The results change under the pager, so page 4 of the old list is not page 4
  // of the new one — it is usually past the end, and reads as an empty archive.
  it("returns to the first page when the search changes", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);
    await screen.findByText("Rifter");
    fireEvent.click(await screen.findByRole("button", { name: "Go to page 2" }));
    await waitFor(() => expect(lastRequest().offset).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText("Search by name"), {
      target: { value: "hobgoblin" },
    });

    await waitFor(() => expect(lastRequest().offset).toBe(0));
  });

  it("returns to the first page when the sort changes", async () => {
    renderWithProviders(<ArchivedJobsList enabled />);
    await screen.findByText("Rifter");
    fireEvent.click(await screen.findByRole("button", { name: "Go to page 2" }));
    await waitFor(() => expect(lastRequest().offset).toBeGreaterThan(0));

    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByText("Job type"));

    await waitFor(() => expect(lastRequest().offset).toBe(0));
  });

  it("offers no pager when one page holds everything", async () => {
    getArchivedJobs.mockResolvedValue(pageOf([job("job-1", "Rifter")]));
    renderWithProviders(<ArchivedJobsList enabled />);
    await screen.findByText("Rifter");

    expect(screen.queryByRole("button", { name: "Go to page 2" })).not.toBeInTheDocument();
  });
});
