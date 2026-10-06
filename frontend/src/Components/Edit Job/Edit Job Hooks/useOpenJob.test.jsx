import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { navigated, outcome } = vi.hoisted(() => ({
  navigated: [],
  outcome: { current: "not-handled" },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => (to) => navigated.push(to),
  useSearch: () => ({ activeGroup: "group-1", focusJobId: "x" }),
}));
vi.mock("../../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: async () => outcome.current,
}));

const { useOpenJob } = await import("./useOpenJob");

beforeEach(() => {
  navigated.length = 0;
  outcome.current = "not-handled";
});

describe("useOpenJob", () => {
  it("goes straight to the job, carrying the group, when the page has no leave rules", async () => {
    const openJob = renderHook(() => useOpenJob()).result.current;

    await openJob("job-9");

    expect(navigated).toEqual([
      {
        to: "/editjob/$jobID",
        params: { jobID: "job-9" },
        search: { activeGroup: "group-1" },
      },
    ]);
  });

  it("hands the carried search to a caller that asks first", async () => {
    const asked = [];
    const openJob = renderHook(() => useOpenJob()).result.current;

    await openJob("job-9", { onUnhandled: (search) => asked.push(search) });

    expect(asked).toEqual([{ activeGroup: "group-1" }]);
    expect(navigated).toEqual([]);
  });

  it("leaves the page's own leave rules to navigate", async () => {
    outcome.current = "navigated";
    const openJob = renderHook(() => useOpenJob()).result.current;

    await openJob("job-9");

    expect(navigated).toEqual([]);
  });
});
