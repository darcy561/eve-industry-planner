# Config mount

**Roadmap:** #19 / #18  
**Phase:** B (stack + sync); A may load files from disk in unit tests only

## Where / how (today)

Host project-home `eip.config.yaml` remains DT sync/Expand SoT. Swarm config **`eip_config_yaml`** (from `./eip.config.yaml`) mounts read-only into `capacity-controller` at **`/etc/eip/eip.config.yaml`** (`EIP_CAPACITY_POLICY_PATH`). Controller polls/reloads. Former `capacity_config` volume stub removed.

## Correctness need

- Swarm task cannot assume a host bind of project home.
- Controller must not import deployment-tool to parse YAML — own structs or thin `services/shared` schema only.

## Trade-offs

Swarm config hash-sync (like other `eip.config.sync` mounts) vs bind-mount: config object is the Swarm-native path.

## Outcome

**Locked.**

- DT materializes a **Swarm config** from project-home `eip.config.yaml` (full file or capacity slice — prefer **full file** for one schema) on rematerialize / `eip sync`, hash-synced like existing file configs.
- Mount read-only into `capacity-controller`.
- Controller polls mtime/inode (≥1s) and reloads Validate → in-memory cfg.
- No arbitrary host bind-mounts; DT writes the config object; controller only reads the file.
- Unit tests embed YAML fixtures without Swarm (Phase A landed).
