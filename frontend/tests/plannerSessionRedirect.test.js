import { describe, it, expect } from "vitest";
import {
  isTerminalPlannerAuthCode,
  parsePlannerAuthCodeFromText,
} from "../src/Functions/Auth/plannerSessionRedirect.js";

describe("plannerSessionRedirect", () => {
  it("parses reauth_required from JSON body", () => {
    expect(
      parsePlannerAuthCodeFromText(
        JSON.stringify({ code: "reauth_required", message: "Unauthorized" })
      )
    ).toBe("reauth_required");
  });

  it("treats reauth_required and session_revoked as terminal", () => {
    expect(isTerminalPlannerAuthCode("reauth_required")).toBe(true);
    expect(isTerminalPlannerAuthCode("session_revoked")).toBe(true);
    expect(isTerminalPlannerAuthCode("session_missing")).toBe(false);
  });
});
