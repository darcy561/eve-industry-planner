# Worked example

The one example every figure on the design canvas comes from, and the golden figures Stage C and Stage D
test against.

**Yields** are the dev static file's (`services/worker/tmp/sde/live_data/reprocessingData.json`).
**Prices are invented** for the design — plausible, not live — and are listed here so the figures
reproduce. **Ore volumes** are EVE's published values; compressed ore is one hundredth of raw. Mineral
volumes are the dev file's (0.01 m³).

## The setup

| | This setup | Pinned |
|---|---|---|
| Where | Tatara, null-sec | Jita IV - Moon 4, NPC station |
| Rigs | L-Set Reprocessing Monitor II | none |
| Implant | RX-804, 4% | RX-804, 4% |
| Skills | Reprocessing V, Reprocessing Efficiency V, ore skills V, Ice Processing IV | same |
| Ore and moon ore yield | 90.63% | 72.36% |
| Ice yield | 89.41% | 71.04% |
| Reprocessing tax | 2.0% | 3.0% |

Selling fees: 4.875% (broker 1.5% + sales tax 3.375%), for a separate seller character.

## To minerals

Paste: Veldspar 128,450 · Scordite 64,220 · Pyroxeres 31,075 · Plagioclase 22,000 · Kernite 8,040 ·
Clear Icicle 12 · Hedbergite 45 · Small Shield Booster I 3 (not reprocessable).

**The output column assumes a floor of the total, and live does not do that.** Live rounds each batch
for ore and rounds the run for gas (plan § A1), so by live's rule the outputs are a little higher — Veldspar
gives 466,092 Tritanium (363 a batch × 1,284) against 465,475 here. Batches and units kept back are
unaffected. The design canvas was drawn from this table, so its output figures carry the same small
difference; they are illustrations, and the engine's tests hold live's rule.

| Item | Batches | Kept back | Gives |
|------|---------|-----------|-------|
| Veldspar | 1,284 | 50 | Tritanium 465,475 |
| Scordite | 642 | 20 | Tritanium 87,276 · Pyerite 64,002 |
| Pyroxeres | 310 | 75 | Pyerite 25,285 · Mexallon 8,428 |
| Plagioclase | 220 | 0 | Tritanium 34,892 · Mexallon 13,957 |
| Kernite | 80 | 40 | Mexallon 4,350 · Isogen 8,700 |
| Clear Icicle | 12 | 0 | Heavy Water 740 · Liquid Ozone 375 · Helium Isotopes 4,441 · Strontium Clathrates 10 |
| Hedbergite | 0 | 45 | — |

Prices (Jita sell): Tritanium 4.10 · Pyerite 12.40 · Mexallon 48.00 · Isogen 118.00 · Heavy Water 212 ·
Liquid Ozone 221 · Helium Isotopes 640 · Strontium Clathrates 1,460. Ore: Veldspar 15.6 · Scordite 17.2 ·
Pyroxeres 24.9 · Plagioclase 34.5 · Kernite 149 · Clear Icicle 251,000 · Hedbergite 355.

| Figure | Value |
|--------|-------|
| Market value of the outputs | 8,922,970 |
| Selling fees on them | 434,995 |
| Reprocessing tax (2%, on market value as a stand-in until Stage A3) | 178,459 |
| Kept-back units, sold as they are, after fees | 23,711 |
| **Reprocessed, after fees and tax** | **8,333,227** |
| **Sold as they are, after fees** | **8,434,835** |
| Difference | −101,608 (−1.2%) |
| Difference with no tax | +76,852 |
| Hauling: as they are / reprocessed | 61,284 m³ / 7,946 m³ |
| Under the pinned setup | 6,576,077 |

Per item, after fees and tax, kept-back units sold as they are in both columns:

| Item | As they are | Reprocessed | Pinned | Difference |
|------|-------------|-------------|--------|------------|
| Veldspar | 1.91M | 1,777,984 | 1,404,435 | −128.2k |
| Scordite | 1.05M | 1,072,621 | 847,247 | +21.9k |
| Pyroxeres | 736.0k | 670,487 | 529,939 | −65.6k |
| Plagioclase | 722.0k | 757,100 | 597,963 | +35.1k |
| Kernite | 1.14M | 1,156,136 | 914,328 | +16.6k |
| Clear Icicle | 2.87M | 2,883,704 | 2,266,970 | +18.5k |
| Hedbergite | 15.2k | 15,196 | 15,196 | — |

Scordite's cost of each output as this ore (ore cost shared by output value): Tritanium 3.93, Pyerite
11.89.

## From minerals

Need: Tritanium 2,000,000 · Pyerite 450,000 · Mexallon 120,000 · Nocxium 4,000. Never choose: Compressed
Spodumain. Shipping 1,000 ISK per m³. Nocxium price 815.

Ore prices are each ore's mineral value at 90.63% yield times a ratio (Veldspar 0.88, Scordite 0.84,
Plagioclase 0.83, Crokite 0.88; compressed ×1.02), rounded to the cent.

**The trimmed plan** (greedy selection, then trimming — the solver's answer rounds to within 0.2% of it):

| Ore | Units | Price | Cost | Volume | Shipping | Gives |
|-----|-------|-------|------|--------|----------|-------|
| Compressed Veldspar | 309,000 | 13.32 | 4,115,880 | 309.0 m³ | 309,000 | Tritanium 1,118,580 |
| Compressed Scordite | 450,200 | 15.26 | 6,870,052 | 675.3 m³ | 675,300 | Tritanium 607,770 · Pyerite 445,698 |
| Compressed Plagioclase | 173,300 | 31.09 | 5,387,897 | 606.5 m³ | 606,550 | Tritanium 273,814 · Mexallon 109,179 |
| Compressed Crokite | 600 | 6,165.08 | 3,699,048 | 96.0 m³ | 96,000 | Pyerite 4,350 · Mexallon 10,872 · Nocxium 4,350 |

| Figure | Value |
|--------|-------|
| Ore cost | 20,072,877 |
| Shipping, 1,687 m³ | 1,686,850 |
| **Ore, delivered** | **21,759,727** |
| Minerals outright | 22,800,000 + 25,740,000 shipping = **48,540,000** |
| Leftovers at market | 288,966 (Nocxium 350 is 285,250 of it) |
| Leftovers after fees | 274,879 |
| Ore, leftovers sold | 21,484,848 |
| Untrimmed greedy plan, delivered | 25,915,339 |

## Erratic ore

Paste: Prismaticite 4,000 — 40 batches of 100, nothing kept back, at the ore yield above (90.63%,
Erratic Ore Processing V). Ranges are SDE build 3326071's `randomizedMaterials`. **The odds are
assumed equal, 1 in 8**, until Stage A4 measures them. Prices beyond those above are invented the same
way: Nocxium 815 · Zydrine 1,050 · Megacyte 2,600 · Morphite 9,800.

One batch gives one of these:

| Mineral | Units, min – max | Value, min – max | Value, expected |
|---------|------------------|------------------|-----------------|
| Tritanium | 333,518 – 450,249 | 1,367,425 – 1,846,024 | 1,606,725 |
| Pyerite | 81,081 – 101,351 | 1,005,407 – 1,256,759 | 1,131,083 |
| Mexallon | 32,101 – 41,272 | 1,540,855 – 1,981,099 | 1,760,977 |
| Isogen | 21,678 – 28,349 | 2,558,086 – 3,345,190 | 2,951,638 |
| Nocxium | 2,605 – 3,647 | 2,123,574 – 2,973,004 | 2,548,289 |
| Zydrine | 1,177 – 1,384 | 1,236,148 – 1,454,068 | 1,345,108 |
| Megacyte | 574 – 752 | 1,493,945 – 1,955,795 | 1,724,870 |
| Morphite | 282 – 565 | 2,771,103 – 5,542,206 | 4,156,654 |

One batch: expected 2,153,168, standard deviation 997,184.

| 40 batches | Value |
|------------|-------|
| Bounds, every batch at its worst / best | 40,216,287 – 221,688,230 |
| Likely range, 10th – 90th percentile (normal) | 78,043,993 – 94,209,449 |
| Likely range, 100,000 simulated runs | 78,176,412 – 94,356,476 |
| **Expected** | **86,126,721** |

The normal figures use z = 1.2816; the engine uses the exact value, 1.28155…, and lands within a few
hundred ISK of them.

Expected units over the 40 batches, each mineral expected from 5 of them; any one mineral can come out
anywhere from none to all 40 batches' worth:

| Mineral | Expected | Possible |
|---------|----------|----------|
| Tritanium | 1,959,421 | 0 – 18,009,994 |
| Pyerite | 456,082 | 0 – 4,054,061 |
| Mexallon | 183,435 | 0 – 1,650,916 |
| Isogen | 125,069 | 0 – 1,133,963 |
| Nocxium | 15,634 | 0 – 145,914 |
| Zydrine | 6,405 | 0 – 55,393 |
| Megacyte | 3,317 | 0 – 30,089 |
| Morphite | 2,121 | 0 – 22,621 |

**On the canvas board** the paste also holds Unrefined Morphite 1,000 (10 batches; 84 – 169 Morphite a
batch at 90.63%), and invented as-is prices of Prismaticite 20,500 and Unrefined Morphite 11,500. After
selling fees (4.875%) and tax (2%), from 100,000 simulated runs:

| | As they are | Reprocessed, expected | Likely | Ahead |
|---|---|---|---|---|
| Prismaticite | 78.00M | 80.18M | 72.80M – 87.82M | 63 in 100 |
| Unrefined Morphite | 10.94M | 11.53M | 10.62M – 12.45M | 80 in 100 |
| Both | 88.94M | 91.71M | 84.27M – 99.45M | 67 in 100 |

Bounds for both: 45.12M – 221.68M.
