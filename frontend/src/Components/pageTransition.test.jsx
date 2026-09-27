import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { startTransition, useEffect } from "react";
import { stubViewTransitions } from "../tests/viewTransitions";
import PageTransition, { usePageKey } from "./pageTransition";

function view(key, body) {
  return <PageTransition contentKey={key}>{body}</PageTransition>;
}

describe("swapping full-page content", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the outgoing content is gone as soon as the key changes", () => {
    const { rerender } = render(view("/a", <div>page a</div>));
    expect(screen.getByText("page a")).toBeTruthy();

    rerender(view("/b", <div>page b</div>));

    expect(screen.queryByText("page a")).toBeNull();
    expect(screen.getByText("page b")).toBeTruthy();
  });

  test("content changing under the same key is not remounted", () => {
    const mounted = vi.fn();
    function Child({ label }) {
      useEffect(() => mounted, []);
      return <div>{label}</div>;
    }

    const { rerender } = render(view("/a", <Child label="first" />));
    rerender(view("/a", <Child label="second" />));

    expect(screen.getByText("second")).toBeTruthy();
    expect(mounted).not.toHaveBeenCalled();
  });

  test("the incoming content is not the surface the outgoing content used", () => {
    const { rerender } = render(view("/a", <div>page a</div>));
    const leaving = screen.getByText("page a").parentElement;

    rerender(view("/b", <div>page b</div>));
    const arriving = screen.getByText("page b").parentElement;

    expect(arriving).not.toBe(leaving);
  });

  test("the incoming content is visible as soon as it renders", () => {
    const { rerender } = render(view("/a", <div>page a</div>));
    rerender(view("/b", <div>page b</div>));

    expect(screen.getByText("page b")).toBeVisible();
  });

  test("the incoming content is still visible once any animation is over", () => {
    const { rerender } = render(view("/a", <div>page a</div>));
    rerender(view("/b", <div>page b</div>));

    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText("page b")).toBeVisible();
  });
});

describe("what animates the swap", () => {
  let viewTransitions;

  beforeEach(() => {
    viewTransitions = stubViewTransitions();
  });
  afterEach(() => viewTransitions.restore());

  async function navigate(rerender, to) {
    await act(async () => {
      startTransition(() => rerender(view(to, <div>{to}</div>)));
    });
  }

  test("a navigation runs one view transition", async () => {
    const { rerender } = render(view("/a", <div>/a</div>));

    await navigate(rerender, "/b");

    expect(viewTransitions.started).toHaveLength(1);
  });

  test("the surface holding the outgoing page is the thing it animates", async () => {
    const { rerender } = render(view("/a", <div>/a</div>));
    const leaving = screen.getByText("/a").parentElement;

    await navigate(rerender, "/b");

    expect(viewTransitions.started[0].namedBefore).toEqual([leaving]);
  });

  test("the surface holding the incoming page is named too", async () => {
    const { rerender } = render(view("/a", <div>/a</div>));

    await navigate(rerender, "/b");
    const arriving = screen.getByText("/b").parentElement;

    expect(viewTransitions.started[0].namedAfter).toEqual([arriving]);
  });

  test("a change under the same key is not a page swap", async () => {
    const { rerender } = render(view("/a", <div>/a</div>));

    await act(async () => {
      startTransition(() => rerender(view("/a", <div>/a</div>)));
    });

    expect(viewTransitions.started).toHaveLength(0);
  });
});

const routerState = vi.hoisted(() => ({ current: { matches: [] } }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }) => select(routerState.current),
}));

describe("the page key", () => {
  function keyFor(matches, isMaintenanceMode = false) {
    routerState.current = { matches };
    let seen;
    function Probe() {
      seen = usePageKey(isMaintenanceMode);
      return null;
    }
    render(<Probe />);
    return seen;
  }

  test("is the route pattern, so a param change is not a page change", () => {
    expect(keyFor([{ routeId: "/editjob/$jobID" }])).toBe("/editjob/$jobID");
  });

  test("maintenance overrides the route", () => {
    expect(keyFor([{ routeId: "/dashboard" }], true)).toBe("maintenance");
  });

  test("survives a router state with no matches", () => {
    expect(keyFor([])).toBe("");
  });
});
