# Blueprint Options

The Blueprint Options panel displays all available blueprints for the current job from your character and corporation inventories. It allows you to quickly select a blueprint and apply its efficiency settings to your job setup.

## Overview

The Blueprint Options panel provides:
- **Blueprint library access** showing all matching blueprints
- **Visual blueprint status** indicating which blueprints are in use
- **One-click efficiency application** to apply ME/TE values
- **Blueprint ownership information** showing character or corporation ownership
- **Runs tracking** for blueprint copies showing remaining runs

## Panel Display

The panel automatically switches layouts based on job type:
- **Manufacturing Jobs**: Shows individual blueprint cards with detailed information
- **Reaction Jobs**: Shows grouped blueprints by owner with summary information
- **Other Job Types**: Shows "No Blueprints Found" message

## Manufacturing Layout

For manufacturing jobs, blueprints are displayed as individual cards in a scrollable grid.

### Blueprint Cards

Each blueprint card displays:

#### Blueprint Image
- **Original Blueprints**: Shows blueprint icon
- **Blueprint Copies (BPC)**: Shows blueprint copy icon
- **Size**: Responsive sizing (32px on mobile, 64px on desktop)
- **Badge**: Owner avatar in top-right corner
  - Character portrait for character-owned blueprints
  - Corporation logo for corporation-owned blueprints

#### Efficiency Values
- **ME (Material Efficiency)**: Material efficiency level (0-10)
- **TE (Time Efficiency)**: Time efficiency level (0-20)

#### Runs Display (Blueprint Copies Only)
- Shows remaining runs for blueprint copies
- **Format**: "Runs: X (Y)" where:
  - X = Runs available after current job completes
  - Y = Total runs before starting current job
- Only displayed if blueprint is a copy (not original)

#### Status Indicator
A colored bar at the bottom indicates blueprint status:
- **Yellow**: Blueprint is currently in use in an active industry job
- **Red**: Blueprint copy is finishing (runs will be exhausted when current job completes)
- **No color**: Blueprint is available for use

### Blueprint Interaction

- **Click**: Applies the blueprint's ME and TE values to the active setup
- **Tooltip**: "Click To Use Blueprint" appears on hover
- **Behavior**: 
  - Updates setup ME value to match blueprint
  - Updates setup TE value to match blueprint (divided by 2)
  - Automatically recalculates job parameters

### Blueprint Sorting

Blueprints are automatically sorted by:
1. **Type**: Original blueprints appear before copies
2. **Material Efficiency**: Higher ME values first
3. **Time Efficiency**: Higher TE values first

### Legend

A legend at the bottom explains the status indicators:
- **Blueprint In Use**: Yellow background - blueprint is active in an industry job
- **Blueprint Finishing**: Red background - blueprint copy will be exhausted after current job

## Reaction Layout

For reaction jobs, blueprints are displayed grouped by owner (character or corporation).

### Owner Groups

Each group displays:

#### Owner Information
- **Avatar Badge**: 
  - Character portrait for character-owned blueprints
  - Corporation logo for corporation-owned blueprints
- **Blueprint Icon**: Reaction blueprint copy icon

#### Summary Statistics
- **Total**: Total number of blueprint copies owned
- **In Use**: Number of blueprints currently active in industry jobs

### Group Display

- Groups are sorted by:
  1. Material efficiency (highest first)
  2. Time efficiency (highest first)
- Each group shows a summary rather than individual blueprints
- Useful for quickly identifying which characters/corporations have available reaction blueprints

## Loading States

### Loading
- Displays "Loading Blueprints..." message
- Appears while fetching blueprint data from ESI API
- Shows for both character and corporation blueprints

### Error
- Displays error message if blueprint loading fails
- Shows specific error details
- May occur due to:
  - ESI API issues
  - Authentication problems
  - Network connectivity issues

### Empty State
- Displays "No Blueprints Found" message
- Appears when no matching blueprints exist in inventory
- Check that:
  - You have blueprints for this item type
  - Blueprints are in character or corporation hangars
  - ESI data is properly synced

## Blueprint Data Sources

The panel pulls blueprint data from:
- **Character Blueprints**: All blueprints in your characters' hangars
- **Corporation Blueprints**: All blueprints in corporation hangars (if you have access)
- **Industry Jobs**: Active industry jobs to determine which blueprints are in use

## Using Blueprints

### Selecting a Blueprint

1. Browse available blueprints in the panel
2. Check status indicators to see which are available
3. Click a blueprint card to apply its efficiency values
4. The active setup's ME and TE values update automatically
5. Job calculations recalculate with new efficiency values

### Best Practices

- **Check Status**: Look for yellow/red indicators to avoid selecting in-use blueprints
- **Compare Efficiency**: Higher ME/TE values reduce material costs and time
- **Consider Runs**: For blueprint copies, ensure sufficient runs remain
- **Verify Ownership**: Badge shows who owns the blueprint (character vs. corporation)

## Blueprint Types

### Original Blueprints
- Unlimited uses
- Can be researched to improve ME/TE
- Shown with blueprint icon (not BPC)
- Status: Yellow if in use, no color if available

### Blueprint Copies (BPC)
- Limited runs (typically 1-300)
- Cannot be researched
- Shown with blueprint copy icon
- Status: 
  - Yellow if in use
  - Red if finishing (runs will be exhausted)
  - No color if available

## Related Documentation

- [Planning Stage Overview](planning) - General planning stage information
- [Setups](setups) - Configuring job setups and efficiency values
- [Blueprint Library](../blueprint-library) - Managing your blueprint collection
- [Edit Job Overview](../edit-job) - Complete job editing guide
