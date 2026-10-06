# Ore selection benchmark

How far today's ore selection is from the cheapest answer, and the lists Stage E's tests use.

## Method

- **Yields:** the dev static file, at 90.63% for ore (the worked example's setup), floored per batch.
- **Prices:** invented. Each ore is priced at its mineral value at that yield times a fixed ratio between
  0.83 and 0.95 (compressed ×1.02); minerals as in [worked-example.md](./worked-example.md), with
  Zydrine 1,090 and Megacyte 2,780. **The percentages show the shape of the problem, not live amounts.**
- **Volumes:** EVE's published raw ore volumes (Veldspar 0.1 m³ … Crokite, Bistot, Arkonor, Spodumain
  16 m³); compressed ore at one hundredth; minerals 0.01 m³. Compressed Spodumain excluded.
- **Greedy:** a line-for-line port of `oreSelector.js` with value weighting 2.0, leftover penalty 0.10,
  compressed preference 0.25, prefer compressed on.
- **Trimmed:** greedy, then each ore reduced by whole batches while every need stays covered, repeated
  until nothing reduces.
- **Optimum:** the linear programme below, solved exactly (fractional batches), with minerals bought
  outright as candidates. It is a lower bound; rounding to whole batches adds well under 1% at these
  quantities.

```
minimise    Σ_i (price_i + rate × volume_i) × units_i
subject to  Σ_i yield_ij × units_i ≥ need_j      for every needed mineral j
            units_i ≥ 0
```

## Results

| List | Shipping | Greedy | Trimmed | Optimum | Optimum uses |
|------|----------|--------|---------|---------|--------------|
| Worked example (Trit 2M, Pye 450k, Mex 120k, Nocx 4k) | none | +23.4% | +3.5% | 19.39M | Veldspar, Scordite, Plagioclase, Jaspet |
| | 1,000/m³ | +20.6% | +1.2% | 21.49M | compressed Veldspar, Scordite, Plagioclase, Crokite |
| Capital mix (Trit 20M, Pye 5M, Mex 1.5M, Iso 300k, Nocx 60k, Zyd 20k, Mega 8k) | none | +25.9% | +4.1% | 292.59M | Veldspar, Scordite, Plagioclase, Kernite, Jaspet, Bistot, Spodumain |
| | 1,000/m³ | +125.4% | +103.8% | 324.27M | six compressed ores and Zydrine outright |
| High-end heavy (Mex 200k, Iso 150k, Nocx 40k, Zyd 15k, Mega 6k) | none | +24.1% | +24.1% | 84.96M | Kernite, Jaspet; Mexallon, Zydrine, Megacyte outright |
| | 1,000/m³ | +305.4% | +305.4% | 89.66M | compressed Plagioclase, Kernite, Dark Ochre; Zydrine, Megacyte outright |

## What it shows

- Trimming recovers most of the gap when the right ores were picked and over-sized. It recovers nothing
  when the wrong ores were picked, which is the high-end case.
- Part of the high-end gap is buying outright, which greedy cannot do. The rest is scoring by unit
  count: ore with many cheap units ranks first on every pass.
- With shipping, raw ore is never chosen in either method; volume alone favours compressed ore.

## Stage E's tests

These six rows are Stage E2's benchmark tests: the solver, rounded and trimmed, within 2% of each
optimum. Fixtures carry the prices above so the figures reproduce. Greedy's figures are kept here
only; the old selector was deleted with Stage E3.

## Reproduced

The figures above cannot be rerun: the per-ore price ratios were not recorded. The engine's tests
therefore use `frontend/src/tests/oreSelectionFixtures.js` — SDE build 3326071's sixteen standard ores
and their compressed forms, the worked example's setup (90.63% yield), the mineral prices above with
Morphite at 9,800, and each ore priced at its minerals' value at that yield times a recorded ratio
(compressed ×1.02). Compressed Spodumain is excluded, as before. `oreToBuy`'s plans against that
fixture:

| List | Shipping | Plan | Fractional optimum | Over optimum | Old selector | Plan uses |
|------|----------|------|--------------------|--------------|--------------|-----------|
| Worked example | none | 19,194,118 | 19,188,956 | +0.03% | 23,828,013 | Veldspar, Scordite, Plagioclase, Jaspet |
| | 1,000/m³ | 21,338,010 | 21,332,421 | +0.03% | 25,816,763 | the same four, compressed |
| Capital mix | none | 293,026,501 | 292,777,184 | +0.09% | 364,596,759 | Veldspar, Scordite, Plagioclase, Kernite, Jaspet, Bistot, Arkonor |
| | 1,000/m³ | 319,946,239 | 319,674,366 | +0.09% | 725,412,109 | six compressed ores; Zydrine outright |
| High-end heavy | none | 83,769,746 | 83,421,561 | +0.42% | 103,775,944 | Kernite, Jaspet, Hemorphite, Arkonor; Zydrine outright |
| | 1,000/m³ | 87,709,288 | 87,649,719 | +0.07% | 361,882,344 | compressed Dark Ochre and Arkonor; Zydrine and Megacyte outright |

The shape matches the original run: compressed ore whenever shipping is charged, minerals bought
outright where no ore beats them delivered, and the old selector furthest off on the high-end list and
with shipping.
