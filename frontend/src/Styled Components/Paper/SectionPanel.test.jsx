import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SectionPanel } from "./SectionPanel";
import { captureReactErrorOnce } from "../../Functions/Helper/captureReactError";

// The boundary reports its label to Sentry rather than to the DOM, and the real
// capture is a no-op without a DSN, so the label is only observable here.
vi.mock("../../Functions/Helper/captureReactError", () => ({
  captureReactErrorOnce: vi.fn(),
  EIP_IN_APP_CRASH_PROMPT_TAG: "eip_in_app_crash_prompt",
}));

describe("SectionPanel", () => {
  it("titles the section and holds its content", () => {
    render(
      <SectionPanel title="Your characters" subtitle="Add more later">
        <p>content</p>
      </SectionPanel>,
    );

    expect(screen.getByText("Your characters")).toBeInTheDocument();
    expect(screen.getByText("Add more later")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("titles it the way every other app-shell panel does", () => {
    // Onboarding used a primary-coloured h6 here, so the first screens a player
    // saw looked unlike the app they were being set up for.
    render(<SectionPanel title="Your characters">x</SectionPanel>);

    const title = screen.getByText("Your characters");
    expect(title.tagName).not.toBe("H6");
    expect(title.className).toMatch(/colorTextSecondary|MuiTypography/);
  });

  it("does without a subtitle", () => {
    render(<SectionPanel title="Your characters">x</SectionPanel>);

    expect(screen.getByText("x")).toBeInTheDocument();
  });
});

describe("spacing between a section's children", () => {
  it("spaces the several siblings a section is passed", () => {
    // Callers pass more than one child and rely on the section to space them;
    // rendering one child cannot see that.
    const { container } = render(
      <SectionPanel title="Your characters">
        <p>first</p>
        <p>second</p>
        <p>third</p>
      </SectionPanel>,
    );

    const stack = container.querySelector(".MuiStack-root");
    expect(stack).not.toBeNull();
    expect(stack.children).toHaveLength(3);
  });

  it("spaces the subtitle from the content below it", () => {
    const { container } = render(
      <SectionPanel title="Your characters" subtitle="Add more later">
        <p>content</p>
      </SectionPanel>,
    );

    expect(container.querySelector(".MuiStack-root").children).toHaveLength(2);
  });
});

describe("a child that throws", () => {
  function Throws() {
    throw new Error("boom");
  }

  function renderThrowing(props) {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    render(
      <SectionPanel {...props}>
        <Throws />
      </SectionPanel>,
    );
    consoleError.mockRestore();
  }

  beforeEach(() => {
    captureReactErrorOnce.mockClear();
  });

  it("is caught rather than taking the page down", () => {
    renderThrowing({ title: "Linked characters" });

    expect(
      screen.getByText(/Something went wrong loading this content/),
    ).toBeInTheDocument();
  });

  it("is reported under the section's own title", () => {
    // Every caller leaves componentName unset, so a fallback of the component's
    // own name here would file every section on every page under one label.
    renderThrowing({ title: "Citadel names" });

    expect(captureReactErrorOnce).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({ componentName: "Citadel names" }),
      }),
    );
  });

  it("is reported under a name the caller gives instead", () => {
    renderThrowing({ title: "Linked characters", componentName: "Roster" });

    expect(captureReactErrorOnce).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({ componentName: "Roster" }),
      }),
    );
  });
});
