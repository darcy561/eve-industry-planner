import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../tests/queryClients.js";

const getSolarSystems = vi.fn();

vi.mock("../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/archiveHarness.jsx");
  return cachedDataMock({
    getSolarSystems: (...args) => getSolarSystems(...args),
  });
});

const VirtualisedSystemSearch = (await import("./virtualisedSystemSearch.jsx"))
  .default;
const { stubElementHeights } = await import("../../tests/elementHeights.js");

const JITA = 30000142;
const AMARR = 30002187;
/** The one system systemStructureRequirements restricts by job type. */
const RESTRICTED = 30100000;
const ALLOWED_JOB_TYPE = 1;

// jsdom measures every element at zero, which leaves the virtualiser deciding one row is enough.
let restoreHeights;
beforeEach(() => {
  restoreHeights = stubElementHeights();
  vi.clearAllMocks();
  getSolarSystems.mockResolvedValue({
    [JITA]: "Jita",
    [AMARR]: "Amarr",
    [RESTRICTED]: "Restricted System",
  });
});
afterEach(() => restoreHeights?.());

function renderSearch(props = {}) {
  const updateSelectedValue = vi.fn();
  const client = testQueryClient();
  render(
    <QueryClientProvider client={client}>
      <VirtualisedSystemSearch
        updateSelectedValue={updateSelectedValue}
        {...props}
      />
    </QueryClientProvider>,
  );
  return updateSelectedValue;
}

describe("picking a solar system", () => {
  it("offers a system from the static table", async () => {
    const user = userEvent.setup();
    renderSearch();
    await screen.findByRole("combobox");

    await user.type(screen.getByRole("combobox"), "Jita");

    expect(await screen.findByText("Jita")).toBeTruthy();
  });

  it("hands back the system that was chosen", async () => {
    const user = userEvent.setup();
    const updateSelectedValue = renderSearch();
    await screen.findByRole("combobox");

    await user.type(screen.getByRole("combobox"), "Amarr");
    await user.click(await screen.findByText("Amarr"));

    expect(updateSelectedValue).toHaveBeenCalledWith(AMARR);
  });

  // A system the app restricts to particular job types is offered only for those.
  it("leaves out a restricted system for a job type it does not allow", async () => {
    const user = userEvent.setup();
    renderSearch({ jobType: 99 });
    await screen.findByRole("combobox");

    await user.type(screen.getByRole("combobox"), "Restricted");

    expect(screen.queryByText("Restricted System")).toBeNull();
  });

  it("offers it for the job type it does allow", async () => {
    const user = userEvent.setup();
    renderSearch({ jobType: ALLOWED_JOB_TYPE });
    await screen.findByRole("combobox");

    await user.type(screen.getByRole("combobox"), "Restricted");

    expect(await screen.findByText("Restricted System")).toBeTruthy();
  });

  // A system carrying no requirement at all stays available to every job type.
  it("keeps an unrestricted system whatever the job type", async () => {
    const user = userEvent.setup();
    renderSearch({ jobType: 99 });
    await screen.findByRole("combobox");

    await user.type(screen.getByRole("combobox"), "Jita");

    expect(await screen.findByText("Jita")).toBeTruthy();
  });

  it("shows the chosen system rather than an empty box", async () => {
    renderSearch({ selectedValue: JITA });

    await vi.waitFor(() =>
      expect(screen.getByRole("combobox").value).toBe("Jita"),
    );
  });

  // MUI matches the value against the options by identity, so an id the table does
  // not carry holds no value rather than a stale or blank-labelled one.
  it("holds no value for a system the table does not carry", async () => {
    renderSearch({ selectedValue: 30099999 });
    await screen.findByRole("combobox");

    expect(screen.getByRole("combobox").value).toBe("");
  });

  it("offers nothing while the table is still loading", async () => {
    getSolarSystems.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderSearch();

    await user.click(screen.getByRole("combobox"));

    expect(screen.queryByRole("option")).toBeNull();
  });
});
