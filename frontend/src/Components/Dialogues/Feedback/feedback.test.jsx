import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSnackbars,
  snackbarMessages,
} from "../../../tests/snackbarHarness.js";
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { submitted } = vi.hoisted(() => ({
  submitted: [],
}));

vi.mock("../../../Functions/Endpoints/Public/feedback", () => ({
  default: async (payload) => {
    submitted.push(payload);
    return true;
  },
}));

vi.mock("../../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../../tests/snackbarHarness.js");
  return snackbarMock();
});

const { FeedbackIcon } = await import("./feedback.jsx");
const { eventEmitter } = await import("../../../utils/EventSystem");
const { FEEDBACK_DIALOGUE_EVENT } =
  await import("../../../Events/feedbackDialogueEvents");

const theme = createTheme();

function open() {
  act(() => {
    eventEmitter.emit(FEEDBACK_DIALOGUE_EVENT, { isOpen: true });
  });
}

function shot(name) {
  return new File(["x"], name, { type: "image/png" });
}

function attach(files) {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files } });
}

async function submit(text) {
  const box = screen.getByRole("textbox", { name: /feedback|response/i });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest("form"));
}

beforeEach(() => {
  submitted.length = 0;
  resetSnackbars();
});

afterEach(() => {
  eventEmitter.removeAllListeners();
});

describe("submitting feedback", () => {
  it("sends what was typed", async () => {
    render(
      <ThemeProvider theme={theme}>
        <FeedbackIcon />
      </ThemeProvider>,
    );
    open();

    await submit("the planner lost my job");

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0].response).toContain("the planner lost my job");
  });

  // The screenshots are read when the form is submitted, not when it is built,
  // so a list read from an earlier render would send the wrong files — or none.
  it("sends the screenshots attached before it was sent", async () => {
    render(
      <ThemeProvider theme={theme}>
        <FeedbackIcon />
      </ThemeProvider>,
    );
    open();

    attach([shot("one.png")]);
    await submit("here is what happened");

    await waitFor(() =>
      expect(submitted[0]?.screenshotFiles.map((f) => f.name)).toEqual([
        "one.png",
      ]),
    );
  });

  it("sends every screenshot attached, not just the first", async () => {
    render(
      <ThemeProvider theme={theme}>
        <FeedbackIcon />
      </ThemeProvider>,
    );
    open();

    attach([shot("one.png")]);
    attach([shot("two.png")]);
    await submit("here is what happened");

    await waitFor(() =>
      expect(submitted[0]?.screenshotFiles.map((f) => f.name)).toEqual([
        "one.png",
        "two.png",
      ]),
    );
  });

  it("sends none when none were attached", async () => {
    render(
      <ThemeProvider theme={theme}>
        <FeedbackIcon />
      </ThemeProvider>,
    );
    open();

    await submit("nothing to show you");

    await waitFor(() => expect(submitted[0]?.screenshotFiles).toEqual([]));
  });

  it("refuses to send with nothing written", async () => {
    render(
      <ThemeProvider theme={theme}>
        <FeedbackIcon />
      </ThemeProvider>,
    );
    open();

    await submit("   ");

    await waitFor(() =>
      expect(snackbarMessages("error")).toContain(
        "Feedback content is required",
      ),
    );
    expect(submitted).toHaveLength(0);
  });
});
