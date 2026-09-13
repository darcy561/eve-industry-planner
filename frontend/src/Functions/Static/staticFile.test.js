import { describe, it, expect, vi } from "vitest";
import staticFile, { byName, nameKey } from "./staticFile";

describe("priming a file", () => {
  it("reads what was loaded", async () => {
    const file = staticFile(async () => ({ a: 1 }));
    await file.prime();

    expect(file.read()).toEqual({ a: 1 });
  });

  // Null rather than an empty value: a caller can tell "has not arrived" from "carries nothing".
  it("reads null before it has loaded", () => {
    expect(staticFile(async () => ({})).read()).toBeNull();
  });

  it("loads once for concurrent callers", async () => {
    const load = vi.fn(async () => ({ a: 1 }));
    const file = staticFile(load);

    await Promise.all([file.prime(), file.prime()]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not load again once it holds the file", async () => {
    const load = vi.fn(async () => ({ a: 1 }));
    const file = staticFile(load);

    await file.prime();
    await file.prime();

    expect(load).toHaveBeenCalledTimes(1);
  });

  // A failure remembered as the answer would leave every later caller inheriting one outage.
  it("retries after a failure", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ a: 1 });
    const file = staticFile(load);

    await expect(file.prime()).rejects.toThrow("offline");
    await file.prime();

    expect(file.read()).toEqual({ a: 1 });
  });

  it("keeps what the receiver returns rather than the raw file", async () => {
    const file = staticFile(
      async () => [{ id: 1 }],
      (list) => new Map(list.map((entry) => [entry.id, entry])),
    );
    await file.prime();

    expect(file.read().get(1)).toEqual({ id: 1 });
  });
});

describe("views of a file", () => {
  it("builds on first use and keeps what it built", async () => {
    const build = vi.fn((contents) => Object.keys(contents));
    const file = staticFile(async () => ({ a: 1, b: 2 }));
    const keys = file.view(build);

    await file.prime();

    expect(keys()).toEqual(["a", "b"]);
    expect(keys()).toBe(keys());
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("answers null before the file has loaded", () => {
    const file = staticFile(async () => ({}));
    expect(file.view(() => "built")()).toBeNull();
  });

  // The trap this exists to stop: a derived value outliving the contents it was derived from.
  it("rebuilds from the file that replaced the one it was built from", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ a: 1 })
      .mockResolvedValue({ b: 2 });
    const file = staticFile(load);
    const keys = file.view((contents) => Object.keys(contents));

    await file.prime();
    expect(keys()).toEqual(["a"]);

    file.reset();
    await file.prime();

    expect(keys()).toEqual(["b"]);
  });

  it("drops what it built when the file is reset", async () => {
    const file = staticFile(async () => ({ a: 1 }));
    const keys = file.view((contents) => Object.keys(contents));

    await file.prime();
    keys();
    file.reset();

    expect(keys()).toBeNull();
  });
});

describe("matching by name", () => {
  it("keys entries by their lowercased name", () => {
    const map = byName([{ name: "Veldspar" }, { name: "Glacial Mass" }]);

    expect(map.get("veldspar")).toEqual({ name: "Veldspar" });
    expect(map.get("glacial mass")).toEqual({ name: "Glacial Mass" });
  });

  it("leaves out an entry carrying no name", () => {
    expect(byName([{ name: "" }, {}, { name: "Veldspar" }]).size).toBe(1);
  });

  it("takes the name from wherever the caller says", () => {
    const map = byName([{ label: "Veldspar" }], (entry) => entry.label);

    expect(map.get("veldspar")).toEqual({ label: "Veldspar" });
  });

  // A player pastes what the game gave them, spacing and all.
  it("looks a name up however it was cased or spaced", () => {
    expect(nameKey("  Glacial Mass ")).toBe("glacial mass");
  });

  it("has no key for an absent name", () => {
    expect(nameKey(undefined)).toBeNull();
    expect(nameKey("")).toBeNull();
  });
});
