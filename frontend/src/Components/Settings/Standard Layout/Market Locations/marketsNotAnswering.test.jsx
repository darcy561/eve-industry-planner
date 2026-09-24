import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const linkCharacter = vi.fn();
let isLinking = false;

vi.mock("../../../Accounts/useLinkCharacter", () => ({
  useLinkCharacter: () => ({ linkCharacter, isLinking }),
}));

const { default: MarketsNotAnswering } =
  await import("./marketsNotAnswering.jsx");

const answering = { id: "a", name: "Answering" };
const notAnswering = (id) => ({
  id,
  name: id,
  readProblem: { label: "No character can dock here", explain: "…" },
});

beforeEach(() => {
  vi.clearAllMocks();
  isLinking = false;
});

// Each row already says what is wrong with it; what none of them can say is
// where to go about it.
describe("offering the way out of a market that will not answer", () => {
  // A panel that keeps a space for bad news makes a reader read it every visit.
  it("is absent while every market is answering", () => {
    const { container } = render(
      <MarketsNotAnswering rows={[answering, answering]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("offers the way out once a market stops answering", () => {
    render(<MarketsNotAnswering rows={[answering, notAnswering("b")]} />);

    expect(
      screen.getByRole("button", { name: "Link a character" }),
    ).toBeTruthy();
  });

  // Linking is an act on the account, so one offer answers for the whole list
  // rather than a button per row claiming to fix one market each.
  it("counts the markets rather than repeating itself", () => {
    render(
      <MarketsNotAnswering
        rows={[notAnswering("b"), notAnswering("c"), answering]}
      />,
    );

    expect(
      screen.getByText(/2 of your markets are not answering/),
    ).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("counts one market as one", () => {
    render(<MarketsNotAnswering rows={[notAnswering("b")]} />);

    expect(
      screen.getByText(/One of your markets is not answering/),
    ).toBeTruthy();
  });

  it("links a character when the reader asks", async () => {
    render(<MarketsNotAnswering rows={[notAnswering("b")]} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Link a character" }),
    );

    expect(linkCharacter).toHaveBeenCalled();
  });

  // A second press while the sign-in window is open would start another.
  it("refuses a second press while one is in flight", () => {
    isLinking = true;

    render(<MarketsNotAnswering rows={[notAnswering("b")]} />);

    expect(
      screen.getByRole("button", { name: "Link a character" }),
    ).toBeDisabled();
  });
});
