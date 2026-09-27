import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useState } from "react";
import ContentDialogue, {
  DialogueCloseAction,
  useDialogueTrigger,
} from "./ContentDialogue";
import { stubViewTransitions } from "../../tests/viewTransitions";

const theme = createTheme();
const bodyRenders = { count: 0 };

function Body() {
  // eslint-disable-next-line react-hooks/immutability
  bodyRenders.count += 1;
  return <p>what the reader came for</p>;
}

function show(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <ContentDialogue title="A Dialogue" onClose={() => {}} {...props}>
        <Body />
      </ContentDialogue>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  bodyRenders.count = 0;
});

describe("the shared dialogue shell", () => {
  it("builds nothing at all while it is shut", () => {
    const { container } = show({ open: false });

    expect(container).toBeEmptyDOMElement();
    expect(bodyRenders.count).toBe(0);
  });

  it("shows the body when it is open", () => {
    show({ open: true });

    expect(screen.getByText("what the reader came for")).toBeInTheDocument();
    expect(screen.getByText("A Dialogue")).toBeInTheDocument();
  });

  it("builds the body only once it is opened", () => {
    const { rerender } = show({ open: false });
    expect(bodyRenders.count).toBe(0);

    rerender(
      <ThemeProvider theme={theme}>
        <ContentDialogue title="A Dialogue" open onClose={() => {}}>
          <Body />
        </ContentDialogue>
      </ThemeProvider>,
    );

    expect(bodyRenders.count).toBeGreaterThan(0);
  });

  it("shows an error in place of the body", () => {
    show({ open: true, isError: true, error: new Error("it broke") });

    expect(screen.queryByText("what the reader came for")).toBeNull();
  });

  it("shows the actions row it is given", () => {
    show({ open: true, actions: <button>Close</button> });

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

describe("what animates a dialogue", () => {
  let viewTransitions;

  beforeEach(() => {
    viewTransitions = stubViewTransitions();
  });
  afterEach(() => viewTransitions.restore());

  function Harness() {
    const dialogue = useDialogueTrigger();
    const [note, setNote] = useState("one");
    return (
      <>
        <button onClick={dialogue.open}>open it</button>
        <ContentDialogue
          {...dialogue.dialogueProps}
          title="A Dialogue"
          actions={<DialogueCloseAction onClose={dialogue.close} />}
        >
          <p>{note}</p>
          <button onClick={() => setNote("two")}>change it</button>
        </ContentDialogue>
      </>
    );
  }

  async function press(name) {
    await act(async () => screen.getByRole("button", { name }).click());
  }

  function showHarness() {
    return render(
      <ThemeProvider theme={theme}>
        <Harness />
      </ThemeProvider>,
    );
  }

  it("leaves the opening to MUI", async () => {
    showHarness();

    await press("open it");

    expect(viewTransitions.started).toHaveLength(0);
  });

  it("does not animate a dialogue that is only changing", async () => {
    showHarness();
    await press("open it");

    await press("change it");

    expect(screen.getByText("two")).toBeInTheDocument();
    expect(viewTransitions.started).toHaveLength(0);
  });

  it("animates the closing dialogue as one surface, backdrop included", async () => {
    showHarness();
    await press("open it");
    const paper = document.querySelector(".MuiDialog-paper");

    await press("Close");

    expect(viewTransitions.started).toHaveLength(1);
    const [named] = viewTransitions.started[0].namedBefore;
    expect(named).toHaveClass("MuiDialog-root");
    expect(named.contains(paper)).toBe(true);
  });

  it("has taken the dialogue away by the time it animates", async () => {
    showHarness();
    await press("open it");

    await press("Close");

    expect(screen.queryByText("one")).toBeNull();
  });
});
