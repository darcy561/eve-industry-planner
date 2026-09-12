import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

const { default: DocumentLockHeaderControl } =
  await import("./DocumentLockHeaderControl.jsx");
const { documentLockKey } =
  await import("../../Functions/DocumentLock/documentLockKey.js");

const theme = createTheme();

const JOBS = "userJobs";

/**
 * The store as the header sees it: one registered document, and whatever the
 * lock knows about it.
 */
function watching(docID, scope = {}) {
  store.current = {
    headerDocumentLockUI: {
      registrations: [{ collection: JOBS, docID, enabled: true }],
    },
    documentLock: {
      scopes: {
        [documentLockKey(JOBS, docID)]: {
          lockHeld: true,
          readOnly: false,
          lockScopeBootstrapped: true,
          viewerCount: 0,
          ...scope,
        },
      },
    },
  };
}

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <DocumentLockHeaderControl />
    </ThemeProvider>,
  );
}

function again() {
  return (
    <ThemeProvider theme={theme}>
      <DocumentLockHeaderControl />
    </ThemeProvider>
  );
}

/**
 * The lock icon pulses to catch the holder's eye; nothing else animates. The
 * control draws nothing at all while no other session is involved, which counts
 * as not pulsing.
 */
function isPulsing() {
  const button = screen.queryAllByRole("button")[0];
  if (!button) return false;
  const wrapper = button.closest("span")?.parentElement ?? button.parentElement;
  return window.getComputedStyle(wrapper).animation.includes("docLockPulse");
}

beforeEach(() => {
  vi.useFakeTimers();
  watching("job-1");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the header lock's passive viewer flash", () => {
  it("does not pulse while nobody else is looking", () => {
    show();

    expect(isPulsing()).toBe(false);
  });

  // The holder is told once, briefly, that someone has arrived to watch.
  it("pulses when the first viewer arrives", () => {
    const { rerender } = show();

    watching("job-1", { viewerCount: 1 });
    rerender(again());

    expect(isPulsing()).toBe(true);
  });

  it("stops pulsing after its moment has passed", () => {
    const { rerender } = show();
    watching("job-1", { viewerCount: 1 });
    rerender(again());

    act(() => vi.advanceTimersByTime(6000));

    expect(isPulsing()).toBe(false);
  });

  // Someone waiting for the lock keeps the control on screen after the viewer
  // has gone, which is where a flash that outlived its reason would show.
  it("stops pulsing when the viewer leaves", () => {
    const { rerender } = show();
    watching("job-1", { viewerCount: 1, waitlistLen: 1 });
    rerender(again());
    expect(isPulsing()).toBe(true);

    watching("job-1", { viewerCount: 0, waitlistLen: 1 });
    rerender(again());

    expect(screen.queryAllByRole("button")).not.toHaveLength(0);
    expect(isPulsing()).toBe(false);
  });

  it("says nothing to a reader who does not hold the lock", () => {
    const { rerender } = show();

    watching("job-1", { viewerCount: 1, lockHeld: false, readOnly: true });
    rerender(again());

    expect(isPulsing()).toBe(false);
  });

  it("does not pulse for viewers who were already there when it opened", () => {
    watching("job-1", { viewerCount: 2 });

    show();

    expect(isPulsing()).toBe(false);
  });

  // Moving to another document starts the count again: the viewers on the new
  // one were not "the first to arrive" here.
  it("does not carry a pulse over to another document", () => {
    const { rerender } = show();
    watching("job-1", { viewerCount: 1 });
    rerender(again());
    expect(isPulsing()).toBe(true);

    watching("job-2", { viewerCount: 3 });
    rerender(again());

    expect(isPulsing()).toBe(false);
  });

  // The pulse says "someone has arrived to watch you edit". A reader who has
  // just lost the lock is not editing, so it stops even mid-flash.
  it("stops pulsing if the lock is lost while the viewer is there", () => {
    const { rerender } = show();
    watching("job-1", { viewerCount: 1 });
    rerender(again());
    expect(isPulsing()).toBe(true);

    watching("job-1", { viewerCount: 1, lockHeld: false, readOnly: true });
    rerender(again());

    expect(screen.queryAllByRole("button")).not.toHaveLength(0);
    expect(isPulsing()).toBe(false);
  });
});
