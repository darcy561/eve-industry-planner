# Reprocessing settings panel (`frontend/src/Components/Reprocessing/reprocessingSettingsPanel.jsx`)

Live SoT for the settings panel on the reprocessing page — the calculation
knobs and the exempt-ore list.

## Opening on an exempt list

The panel opens itself the moment there is an exempt ore to show, because an
ore already on the exempt list is the reason a reader would come looking; it
never shuts itself. Arriving at the page with ores already exempt shows the
panel open on the first painted frame, not open a frame later. Shutting the
panel is the reader's to do, and it stays shut once they have, until the
exempt list changes again.

## Calculation knobs

`preferCompressed`, `sellExcessMineralTypes`, the compression bonus
multiplier, the value multiplier, and the waste penalty multiplier all read
and write through `pageState` / `pageActions`. A signed-in reader can save
the current settings as their default or revert to the application default;
a signed-out reader sees the controls without the save/revert actions.
