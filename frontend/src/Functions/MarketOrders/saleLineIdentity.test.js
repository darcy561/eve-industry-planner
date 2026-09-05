import { describe, it, expect, vi } from "vitest";

import MarketOrder from "../../Classes/marketOrder.js";
import Transaction from "../../Classes/transaction.js";
import LinkedESIJob from "../../Classes/linkedESIJob.js";

vi.mock("../../Hooks/EveEsi/Character/useGetAllCharacterJournal", () => ({
  getAllCachedCharacterJournal: () => ({ data: {} }),
}));
vi.mock("../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal", () => ({
  getAllCachedCorporationJournal: () => ({
    data: {
      98057377: [
        {
          id: 55,
          ref_type: "brokers_fee",
          date: "2026-08-01T00:00:00Z",
          character_id: 2117000001,
        },
      ],
    },
  }),
}));

const { default: findBrokersFeeEntry } = await import("./findBrokersFeeEntry.js");

// A corporation sale can only be reported against a corporation if the id ESI
// supplied reaches the stored job. Nothing later can recover it: the archive is
// the only record, and ESI serves corporation wallets for a limited window.
describe("corporation identity on stored sale lines", () => {
  it("keeps the corporation an ESI market order was fetched under", () => {
    const order = MarketOrder.fromESI({
      order_id: 900,
      is_corporation: true,
      corporation_id: 98057377,
      price: 10,
      issued: "2026-08-01T00:00:00Z",
    });

    expect(order.corporation_id).toBe(98057377);
    expect(order.is_corporation).toBe(true);
  });

  it("keeps the corporation an ESI transaction was fetched under", () => {
    const transaction = Transaction.fromESI(
      {
        transaction_id: 1,
        quantity: 4,
        unit_price: 10,
        date: "2026-08-01T00:00:00Z",
        corporation_id: 98057377,
        is_personal: false,
      },
      {
        journalEntry: { amount: 400 },
        taxEntry: { amount: -40 },
        description: "desc",
        owner: { CharacterHash: "hash-1" },
      },
    );

    expect(transaction.corporation_id).toBe(98057377);
    expect(transaction.is_corp).toBe(true);
  });

  it("records no corporation for a personal sale", () => {
    const order = MarketOrder.fromESI({ order_id: 901, is_corporation: false });
    const transaction = Transaction.fromESI(
      { transaction_id: 2, is_personal: true },
      { description: "desc", owner: { CharacterHash: "hash-1" } },
    );

    expect(order.corporation_id).toBeNull();
    expect(transaction.corporation_id).toBeNull();
  });

  // A broker fee records no identity of its own: it is charged for one order,
  // and that order already says whose it was.
  it("leaves identity off a broker fee, which its order carries", () => {
    const fee = findBrokersFeeEntry(
      {
        order_id: 900,
        corporation_id: 98057377,
        character_id: 2117000001,
        issued: "2026-08-01T00:00:00Z",
      },
      12.5,
      null,
    );

    expect(fee.order_id).toBe(900);
    expect(fee).not.toHaveProperty("corporation_id");
    expect(fee).not.toHaveProperty("character_id");
    expect(fee).not.toHaveProperty("CharacterHash");
  });

  // The character is recorded the same way, so character_ref has an input at all.
  it("keeps the character each line was fetched for", () => {
    const order = MarketOrder.fromESI({ order_id: 900, character_id: 2117000001 });
    const transaction = Transaction.fromESI(
      { transaction_id: 1, character_id: 2117000001, is_personal: true },
      {
        journalEntry: { amount: 400 },
        taxEntry: { amount: -40 },
        description: "desc",
        owner: { CharacterHash: "hash-1" },
      },
    );
    const linked = new LinkedESIJob(
      { job_id: 5, character_id: 2117000001, corporation_id: 98057377 },
      { CharacterHash: "hash-1" },
    );

    expect(order.character_id).toBe(2117000001);
    expect(transaction.character_id).toBe(2117000001);
    expect(linked.character_id).toBe(2117000001);
  });
});
