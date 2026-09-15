import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { TYPE_IMAGE } from "../../Functions/Shared/eveImage";
import EveImageAvatar from "./EveImageAvatar";

const pictureIn = (container) => container.querySelector(".MuiAvatar-img");

describe("what is asked for", () => {
  it("names the subject it was given", () => {
    const { container } = render(
      <EveImageAvatar type={34} variation={TYPE_IMAGE.BLUEPRINT} size={32} />,
    );

    expect(pictureIn(container).src).toBe(
      "https://images.evetech.net/types/34/bp?size=64",
    );
  });

  it("asks at twice the drawn size, so a dense screen has pixels to use", () => {
    const { container } = render(
      <EveImageAvatar character={2114000001} size={32} />,
    );

    expect(pictureIn(container).src).toContain("size=64");
  });

  it("asks at the largest size a responsive picture is ever drawn", () => {
    const { container } = render(
      <EveImageAvatar corporation={98000001} size={{ xs: 24, sm: 48 }} />,
    );

    expect(pictureIn(container).src).toContain("size=128");
  });

  it("shows a url something else resolved when given one", () => {
    const { container } = render(
      <EveImageAvatar src="https://example.test/a.png" />,
    );

    expect(pictureIn(container).src).toBe("https://example.test/a.png");
  });

  it("names the picture for a reader who cannot see it", () => {
    const { container } = render(<EveImageAvatar type={34} alt="Tritanium" />);

    expect(pictureIn(container)).toHaveAttribute("alt", "Tritanium");
  });
});

// It stays a MUI Avatar so AvatarGroup's overlap, Chip's avatar slot and Badge keep working: each
// styles a child it recognises by MUI's own class.
describe("what it is", () => {
  it("is an avatar, and wears the variant it was given", () => {
    const { container } = render(<EveImageAvatar type={34} variant="square" />);

    expect(container.querySelector(".MuiAvatar-root")).toHaveClass(
      "MuiAvatar-square",
    );
  });

  it("is circular unless told otherwise, as MUI's own avatar is", () => {
    const { container } = render(<EveImageAvatar type={34} />);

    expect(container.querySelector(".MuiAvatar-root")).toHaveClass(
      "MuiAvatar-circular",
    );
  });
});

// Callers lean on the spread for what this component does not name itself: MarketGroupIcon puts a
// glyph behind an obsolete group's missing picture, OwnerAvatar carries a title, and Chip and
// AvatarGroup style the avatar by cloning a className onto it.
describe("what it passes through", () => {
  it("hands a child to the avatar, for a caller that draws its own stand-in", () => {
    const { container } = render(
      <EveImageAvatar type={undefined}>
        <span data-testid="stand-in" />
      </EveImageAvatar>,
    );

    expect(
      container.querySelector('[data-testid="stand-in"]'),
    ).toBeInTheDocument();
  });

  it("hands anything else it was given to the avatar", () => {
    const { container } = render(
      <EveImageAvatar type={34} title="Tritanium" className="MuiChip-avatar" />,
    );

    const avatar = container.querySelector(".MuiAvatar-root");
    expect(avatar).toHaveAttribute("title", "Tritanium");
    expect(avatar).toHaveClass("MuiChip-avatar");
  });
});

// EVE serves its own default portrait and logo under id 1, and nothing at all for an item.
describe("when the app holds no id", () => {
  it("asks EVE for its own default portrait", () => {
    const { container } = render(
      <EveImageAvatar character={undefined} size={32} />,
    );

    expect(pictureIn(container).src).toBe(
      "https://images.evetech.net/characters/1/portrait?size=64",
    );
  });

  it("asks EVE for its own default logo", () => {
    const { container } = render(
      <EveImageAvatar corporation={null} size={32} />,
    );

    expect(pictureIn(container).src).toBe(
      "https://images.evetech.net/corporations/1/logo?size=64",
    );
  });

  it("asks for no item picture, there being no default to ask for", () => {
    const { container } = render(<EveImageAvatar type={undefined} />);

    expect(pictureIn(container)).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("images.evetech.net");
  });
});
