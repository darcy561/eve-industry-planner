import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { withQueryClient } from "../../tests/utils.js";

const loadPlannerSettings = vi.fn(async () => null);
let state = null;

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => state);
});

const { usersStoreState } = await import("../../tests/usersStoreHarness.js");
const { extrasCategoriesDefault } =
  await import("../../Context/defaultValues.jsx");
const { usePlannerExtrasCategories } = await import("./plannerSettings.js");

function setState({ isLoggedIn = true, byOwner = {} } = {}) {
  state = usersStoreState({
    account: { isLoggedIn },
    plannerSettings: { byOwner, actions: { loadPlannerSettings } },
  });
}

const read = () =>
  renderHook(() => usePlannerExtrasCategories(), {
    wrapper: ({ children }) => withQueryClient(children),
  });

describe("the active planner's extras categories", () => {
  it("answers the defaults while the planner's own list is still being read", async () => {
    loadPlannerSettings.mockClear();
    setState();

    const { result } = read();

    expect(result.current.categories).toEqual(extrasCategoriesDefault);
    expect(result.current.isHeld).toBe(false);
    await waitFor(() =>
      expect(loadPlannerSettings).toHaveBeenCalledWith("account:acc-1"),
    );
  });

  it("answers the planner's own list once it is held", () => {
    const held = [{ id: "0", label: "Unassigned" }];
    setState({ byOwner: { "account:acc-1": { extrasCategories: held } } });

    const { result } = read();

    expect(result.current.categories).toBe(held);
    expect(result.current.isHeld).toBe(true);
  });

  it("asks for nothing with nobody signed in", async () => {
    loadPlannerSettings.mockClear();
    setState({ isLoggedIn: false });

    read();

    await waitFor(() => expect(loadPlannerSettings).not.toHaveBeenCalled());
  });
});
