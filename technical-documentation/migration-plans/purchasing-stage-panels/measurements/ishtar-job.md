# The job the full-page design is drawn from

The design reference's full-page view (§9b) is drawn from a real job rather than an invented one, so
the row count, the quantities, the volumes and the install cost are figures the app actually produces.
This records which job, and what was taken from it.

**A real job**, from `eve_industry_planner_snapshot.user_job_documents` — a dump of the live database
restored into the local dev mongo, so it is a real document at an unstated moment. Prices and purchase
history in the design are illustrative; everything below is not.

## The job

An **Ishtar** — Tech II heavy assault cruiser, `metaLevel` 2, manufacturing — with one setup:

| Field | Value |
|-------|-------|
| Runs × jobs | 20 × 1 |
| ME / TE | 3 / 1 (shown as TE 2) |
| Produces | 20, at `itemsProducedPerRun` 1 |
| Structure / rig / system type | 0 / 0 / 0 — NPC Station, no rig |
| System | 30000142 (Jita) |
| Estimated install cost | 720,758,135.56 |
| Estimated time | 3,459,456 s ≈ 40 days |
| `rawTime` | 240,000 s |

## The recipe, at ME 3 for the whole setup

`jobType` 1 is manufacturing — a material the planner can build a child job for. `jobType` 0 is a base
material it cannot.

| typeID | Material | jobType | Volume | Quantity |
|--------|----------|---------|--------|----------|
| 11545 | Crystalline Carbonide Armor Plate | 1 | 1 | 109,125 |
| 11541 | Photon Microprocessor | 1 | 1 | 26,190 |
| 11553 | Oscillator Capacitor Unit | 1 | 1 | 8,730 |
| 11556 | Pulse Shield Emitter | 1 | 1 | 8,730 |
| 11535 | Magnetometric Sensor Cluster | 1 | 1 | 7,722 |
| 3828 | Construction Blocks | 0 | 0.75 | 2,910 |
| 11399 | Morphite | 0 | 0.01 | 2,910 |
| 11531 | Ion Thruster | 1 | 1 | 1,455 |
| 11547 | Fusion Reactor Unit | 1 | 1 | 738 |
| 11478 | R.A.M.- Starship Tech | 1 | 0.04 | 350 |
| 626 | Vexor | 1 | 115,000 | 20 |

Total volume **2,464,915.6 m³**.

## Why this job was picked

- **Eleven materials, nine of them buildable**, so the worklist shows the buy/build/awaiting mix rather
  than a list of things to buy.
- **One row is 93% of the volume.** The twenty Vexor hulls are 2,300,000 m³ of the 2,464,916 total — a
  fact a card grid sorted by purchase status cannot surface, and the worklist's footer can.
- **The install cost is not a footnote.** 720.8M against roughly 1.1B of materials at illustrative
  prices, on a figure the current setup card does not display at all.
- **It is Tech II**, so the Job costs panel has invention entries to hold rather than being absent.

## What the design added

The purchase history, the prices, the child-job names and the invention and extras entries are made up
for the mockup. The eleven rows, their quantities and volumes, the setup and its install cost and time
are read from the document.
