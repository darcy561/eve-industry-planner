import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FirstLoginSupportStep } from "./FirstLoginSupportStep";

const openFeedbackDialogue = vi.fn();

// Hoisted: other modules read the config while they are being imported, which
// happens before a plain `let` in this file has been initialised.
const configHolder = vi.hoisted(() => ({ current: {} }));

vi.mock("../../../global-config-app", () => ({
  get default() {
    return configHolder.current;
  },
}));

vi.mock("../../../Events/feedbackDialogueEvents", () => ({
  openFeedbackDialogue: (...args) => openFeedbackDialogue(...args),
}));

const FULLY_CONFIGURED = {
  DEFAULT_DISCORD_INVITE: "https://discord.gg/example",
  DEFAULT_GITHUB_LINK: "https://github.com/example/repo",
  DEFAULT_EVE_FORUM_THREAD_LINK: "https://forums.eveonline.com/t/example",
  DEFAULT_INGAME_SUPPORT_CHANNEL: "EVE Industry Planner",
  DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER: "Oswold Saraki",
  ENABLE_FEEDBACK_ICON: true,
};

function renderStep(overrides = {}) {
  configHolder.current = { ...FULLY_CONFIGURED, ...overrides };
  return render(<FirstLoginSupportStep />);
}

describe("the support step of first login", () => {
  beforeEach(() => {
    configHolder.current = { ...FULLY_CONFIGURED };
  });

  it("names the section and says what it is for", () => {
    renderStep();

    expect(screen.getByText("Need help later?")).toBeInTheDocument();
    expect(screen.getByText(/best places to get support/i)).toBeInTheDocument();
  });

  it("opens a configured link in a new tab, and says so to a screen reader", () => {
    renderStep();

    const discord = screen.getByRole("link", {
      name: "Discord (opens in a new tab)",
    });

    expect(discord).toHaveAttribute("href", "https://discord.gg/example");
    expect(discord).toHaveAttribute("target", "_blank");
    expect(discord).toHaveAttribute(
      "rel",
      expect.stringContaining("noreferrer"),
    );
  });

  it("offers no link for a channel this deployment has not configured", () => {
    renderStep({ DEFAULT_DISCORD_INVITE: "" });

    expect(
      screen.queryByRole("link", { name: /^Discord/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Discord invite is not set/i)).toBeInTheDocument();
  });

  it("drops the GitHub card entirely when no repository is configured", () => {
    renderStep({ DEFAULT_GITHUB_LINK: "  " });

    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
  });

  it("trims a trailing slash off the GitHub link", () => {
    renderStep({ DEFAULT_GITHUB_LINK: "https://github.com/example/repo/" });

    expect(
      screen.getByRole("link", { name: "GitHub (opens in a new tab)" }),
    ).toHaveAttribute("href", "https://github.com/example/repo");
  });

  it("opens the feedback dialogue when that card is pressed", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(
      screen.getByRole("button", {
        name: "Feedback & screenshots (opens dialogue)",
      }),
    );

    expect(openFeedbackDialogue).toHaveBeenCalledTimes(1);
  });

  it("reaches the feedback card by keyboard, which is its only route without a pointer", async () => {
    const user = userEvent.setup();
    renderStep();

    const feedback = screen.getByRole("button", {
      name: "Feedback & screenshots (opens dialogue)",
    });
    feedback.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(openFeedbackDialogue).toHaveBeenCalledTimes(2);
  });

  it("hides the feedback card when the deployment has the icon switched off", () => {
    renderStep({ ENABLE_FEEDBACK_ICON: false });

    expect(
      screen.queryByText("Feedback & screenshots"),
    ).not.toBeInTheDocument();
  });

  it("states the in-game channel and mail contact, which have no link to follow", () => {
    renderStep();

    expect(screen.getByText("EVE Industry Planner")).toBeInTheDocument();
    expect(screen.getByText("Oswold Saraki")).toBeInTheDocument();
  });
});
