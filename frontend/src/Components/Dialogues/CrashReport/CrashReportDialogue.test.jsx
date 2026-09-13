import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { captured } = vi.hoisted(() => ({ captured: [] }));

vi.mock("@sentry/react", () => ({
  captureFeedback: (feedback, hint) => captured.push({ feedback, hint }),
}));

vi.mock("../../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../../tests/snackbarHarness.js");
  return snackbarMock();
});

const { CrashReportDialogue } = await import("./CrashReportDialogue.jsx");
const { eventEmitter } = await import("../../../utils/EventSystem");
const { OPEN_SENTRY_CRASH_REPORT } =
  await import("../../../Events/crashReportEvents");

const theme = createTheme();

function open() {
  act(() => {
    eventEmitter.emit(OPEN_SENTRY_CRASH_REPORT, {
      isOpen: true,
      eventId: "event-1",
    });
  });
}

function shot(name) {
  return new File(["x"], name, { type: "image/png" });
}

function attach(files) {
  fireEvent.change(document.querySelector('input[type="file"]'), {
    target: { files },
  });
}

async function submit(text) {
  const box = screen.getAllByRole("textbox")[0];
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest("form"));
}

function mount() {
  return render(
    <ThemeProvider theme={theme}>
      <CrashReportDialogue />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  captured.length = 0;
});

afterEach(() => {
  eventEmitter.removeAllListeners();
});

describe("reporting a crash", () => {
  it("sends what was written against the event it came from", async () => {
    mount();
    open();

    await submit("the planner went white");

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0].feedback.message).toContain("the planner went white");
    expect(captured[0].feedback.associatedEventId).toBe("event-1");
  });

  // The screenshots are read when the form is submitted rather than when it was
  // built, so a list read from an earlier render would attach the wrong files.
  it("attaches the screenshots that were added", async () => {
    mount();
    open();

    attach([shot("crash.png")]);
    await submit("it looked like this");

    await waitFor(() =>
      expect(captured[0]?.hint.attachments.map((a) => a.filename)).toEqual([
        "crash.png",
      ]),
    );
  });

  it("attaches every screenshot added, numbering them", async () => {
    mount();
    open();

    attach([shot("one.png")]);
    attach([shot("two.png")]);
    await submit("it looked like this");

    await waitFor(() =>
      expect(captured[0]?.hint.attachments.map((a) => a.filename)).toEqual([
        "1-one.png",
        "2-two.png",
      ]),
    );
  });

  it("sends no attachments when none were added", async () => {
    mount();
    open();

    await submit("nothing to show");

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0].hint.attachments).toBeUndefined();
  });
});
