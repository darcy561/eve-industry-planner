import { describe, expect, it, afterEach } from "vitest";
import { getWikiUrl } from "../src/Functions/Helper/getWikiUrl";

describe("getWikiUrl", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  function setLocation({ protocol = "https:", hostname = "example.com" } = {}) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { protocol, hostname },
    });
  }

  it("builds the wiki subdomain home URL", () => {
    setLocation();
    expect(getWikiUrl()).toBe("https://wiki.example.com/");
    expect(getWikiUrl("")).toBe("https://wiki.example.com/");
  });

  it("encodes path segments and keeps hashes", () => {
    setLocation({ protocol: "http:", hostname: "localhost" });
    expect(getWikiUrl("edit job/planning/setups")).toBe(
      "http://wiki.localhost/edit%20job/planning/setups"
    );
    expect(getWikiUrl("/edit job/planning#setup-panel")).toBe(
      "http://wiki.localhost/edit%20job/planning#setup-panel"
    );
  });
});
