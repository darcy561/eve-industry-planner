import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  askEachCharacter,
  resetReauthorisationReports,
} from "./askEachCharacter";
import { LocationResolutionError } from "./locationOutcome";

const RAITARU = 1035466617946;
const about = { locationID: RAITARU, reads: "structure names" };

const main = { CharacterHash: "hash-main", CharacterName: "Main" };
const alt = { CharacterHash: "hash-alt", CharacterName: "Alt" };
const third = { CharacterHash: "hash-third", CharacterName: "Third" };

/** What a character whose token never carried the scope throws. */
function unaskable() {
  return new LocationResolutionError("token lacks the scope", {
    needsReauthorisation: true,
  });
}

beforeEach(() => {
  resetReauthorisationReports();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the first character who can answer", () => {
  it("answers for the account, and the rest are not asked", async () => {
    const ask = vi
      .fn()
      .mockResolvedValue({ refused: false, name: "Somewhere" });

    const walk = await askEachCharacter([main, alt], ask, about);

    expect(walk).toEqual({
      refused: false,
      answer: { refused: false, name: "Somewhere" },
      // Named so a caller that can remember who answered does not have to work
      // it out from the order it passed.
      character: main,
    });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("is reached past the characters that were refused", async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce({ refused: true })
      .mockResolvedValueOnce({ refused: false, name: "Somewhere" });

    const walk = await askEachCharacter([main, alt], ask, about);

    expect(walk.answer.name).toBe("Somewhere");
  });

  // A caller that knows which character to try — a market whose last successful
  // reader was recorded — puts it first and the walk honours that.
  it("is asked for in the order the characters were given", async () => {
    const asked = [];
    const ask = vi.fn(async (character) => {
      asked.push(character.CharacterHash);
      return { refused: true };
    });

    await askEachCharacter([third, main, alt], ask, about);

    expect(asked).toEqual(["hash-third", "hash-main", "hash-alt"]);
  });

  // A character that could not ask this time might be the one that can see it,
  // so the walk carries on rather than stopping at the failure.
  it("is still reached past a character that failed", async () => {
    const ask = vi
      .fn()
      .mockRejectedValueOnce(new Error("ESI is down"))
      .mockResolvedValueOnce({ refused: false, name: "Somewhere" });

    const walk = await askEachCharacter([main, alt], ask, about);

    expect(walk.answer.name).toBe("Somewhere");
  });
});

describe("what the account is told when nobody answers", () => {
  it("is refused once every character has been refused", async () => {
    const ask = vi.fn().mockResolvedValue({ refused: true });

    expect(await askEachCharacter([main, alt], ask, about)).toEqual({
      refused: true,
    });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  // The distinction the whole walk exists for: a failure is not an answer, and
  // settling it as no access would cache a rate limit as a fact about the place.
  it("throws when a character failed rather than answering", async () => {
    const failure = new Error("ESI is down");
    const ask = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ refused: true });

    await expect(askEachCharacter([main, alt], ask, about)).rejects.toBe(
      failure,
    );
  });

  it("throws when every character failed", async () => {
    const ask = vi.fn().mockRejectedValue(new Error("ESI is down"));

    await expect(askEachCharacter([main, alt], ask, about)).rejects.toThrow(
      /ESI is down/,
    );
  });

  // Nobody was in a position to ask, so nothing has been established about the
  // structure — as against being told no.
  it("throws when no character's token carries the scope", async () => {
    const ask = vi.fn().mockRejectedValue(unaskable());

    await expect(
      askEachCharacter([main, alt], ask, about),
    ).rejects.toMatchObject({ needsReauthorisation: true });
  });

  // One character that cannot ask does not stop another's refusal counting.
  it("is refused when one character could ask and was refused", async () => {
    const ask = vi
      .fn()
      .mockRejectedValueOnce(unaskable())
      .mockResolvedValueOnce({ refused: true });

    expect(await askEachCharacter([main, alt], ask, about)).toEqual({
      refused: true,
    });
  });

  it("throws when the account has no characters", async () => {
    const ask = vi.fn();

    await expect(askEachCharacter([], ask, about)).rejects.toBeInstanceOf(
      LocationResolutionError,
    );
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("telling the reader a character needs linking again", () => {
  it("names the character and what it cannot read", async () => {
    const ask = vi.fn().mockRejectedValue(unaskable());

    await expect(askEachCharacter([main], ask, about)).rejects.toThrow();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Main cannot read structure names"),
    );
  });

  // Once per character, not once per structure it could not be asked about.
  it("says it once however many structures are asked about", async () => {
    const ask = vi.fn().mockRejectedValue(unaskable());

    await expect(askEachCharacter([main], ask, about)).rejects.toThrow();
    await expect(
      askEachCharacter([main], ask, {
        locationID: 42,
        reads: "structure names",
      }),
    ).rejects.toThrow();

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  // A token missing the market scope is a different fact from one missing the
  // name scope, and a reader who is told only the first fixes half the problem.
  it("says it again for something else the character cannot read", async () => {
    const ask = vi.fn().mockRejectedValue(unaskable());

    await expect(askEachCharacter([main], ask, about)).rejects.toThrow();
    await expect(
      askEachCharacter([main], ask, {
        locationID: RAITARU,
        reads: "market prices in player structures",
      }),
    ).rejects.toThrow();

    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});
