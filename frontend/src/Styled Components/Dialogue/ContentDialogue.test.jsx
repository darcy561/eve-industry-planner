import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import ContentDialogue from "./ContentDialogue";

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
