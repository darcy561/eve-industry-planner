import { describe, expect, it, vi } from "vitest";

import { activateOnEnterOrSpace } from "./cardActivation";

const keyEvent = (key) => ({ key, preventDefault: vi.fn() });

describe("activateOnEnterOrSpace", () => {
  it.each(["Enter", " "])("activates on %s", (key) => {
    const activate = vi.fn();
    const event = keyEvent(key);

    activateOnEnterOrSpace(activate)(event);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it.each(["Tab", "a", "ArrowDown", "Escape"])(
    "leaves %s to the browser",
    (key) => {
      const activate = vi.fn();
      const event = keyEvent(key);

      activateOnEnterOrSpace(activate)(event);

      expect(activate).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    },
  );

  it("hands the event on, for a caller that needs it", () => {
    const activate = vi.fn();
    const event = keyEvent("Enter");

    activateOnEnterOrSpace(activate)(event);

    expect(activate).toHaveBeenCalledWith(event);
  });
});
