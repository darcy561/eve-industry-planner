# Job Setup Info

The Job Setup Info panel displays a horizontal scrollable view of all job setups configured for the current job. It provides a quick reference for setup configurations, production quantities, and structure information without needing to navigate to the planning stage.

## Overview

The Job Setup Info panel provides:
- **Setup overview** showing all configured setups at a glance
- **Production quantities** for each setup
- **Structure information** including location and configuration
- **Efficiency values** for manufacturing jobs (ME/TE)
- **Quick reference** for setup details during purchasing

## Panel Layout

### Horizontal Scrollable Container
- **Layout**: Horizontal row of setup cards
- **Scrolling**: 
  - Auto-scrolls on mobile
  - Scrolls when more than 5 setups on desktop
  - Smooth scrolling with touch support
- **Spacing**: Consistent gap between setup cards
- **Responsive**: Card width adapts to screen size

### Setup Cards
Each setup is displayed as an individual card showing all configuration details.

## Setup Card Display

### Efficiency Values (Manufacturing Only)
For manufacturing jobs, cards display:
- **ME (Material Efficiency)**: Material efficiency level
- **TE (Time Efficiency)**: Time efficiency level (displayed as TE × 2)
- **Layout**: Four-column layout with ME, TE, Runs, Jobs

### Efficiency Values (Other Job Types)
For reaction and other job types:
- **Layout**: Two-column layout with Runs and Jobs
- **No ME/TE**: Efficiency values not shown

### Runs and Jobs
- **Runs**: Number of blueprint runs configured
- **Jobs**: Number of job slots configured
- **Always displayed**: Shown for all job types

### Structure Information

#### Custom Structures
When a custom structure is assigned:
- **Display**: Custom structure name
- **Tooltip**: Shows system index percentage on hover
- **Fallback**: Shows "Missing Structure" if custom structure no longer exists

#### Default Structures
When using default structure selection:
- **System Type**: Security class (Highsec, Lowsec, Nullsec, Wormhole)
- **Structure Type**: Structure type (Engineering Complex, Citadel, etc.)
- **Rig Type**: Rig configuration
- **System Name**: Specific system where job will run
- **System Index**: Displayed in tooltip showing percentage
- **Layout**: Three-column layout for system/structure/rig types

### Quantity Planned
- **Label**: "Quantity Planned:"
- **Value**: Total items that will be produced by this setup
- **Calculation**: `Items Per Run × Runs × Job Slots`
- **Format**: Locale-formatted number
- **Purpose**: Shows production capacity of the setup

## Card Layout Details

### Card Dimensions
- **Mobile**: 220px width
- **Tablet**: 250px width
- **Desktop**: 280px width
- **Large Desktop**: 400px width
- **Height**: Full height of container

### Card Styling
- **Elevation**: Paper elevation 3 (shadow)
- **Padding**: Consistent internal padding
- **Layout**: Flex column layout
- **Scrollable Content**: Internal content scrolls if needed

### Information Organisation
- **Top Section**: Efficiency values and runs/jobs
- **Middle Section**: Structure information
- **Bottom Section**: Quantity planned
- **Spacing**: Consistent gaps between sections

## Using the Panel

### Quick Reference
1. Scroll horizontally to view all setups
2. Review efficiency values for manufacturing jobs
3. Check structure configurations
4. Verify production quantities

### Setup Comparison
1. View multiple setups side-by-side
2. Compare efficiency values
3. Review structure differences
4. Evaluate production quantities

### Planning Reference
- Use during purchasing to understand production scale
- Reference structure locations for material planning
- Check efficiency values for cost calculations
- Verify setup configurations are correct

## Responsive Behaviour

### Mobile
- **Card Width**: 220px
- **Auto-scroll**: Enabled
- **Touch Scrolling**: Smooth touch scrolling
- **Compact Layout**: Optimised for small screens

### Desktop
- **Card Width**: 280-400px depending on screen size
- **Scroll When Needed**: Only scrolls if more than 5 setups
- **Full Information**: All details visible
- **Hover Tooltips**: System index shown on hover

## Tooltips

### System Index
- **Trigger**: Hover over system name or custom structure name
- **Content**: "System Index: X%" or "System Index Value: X%"
- **Purpose**: Shows system index percentage for cost calculations

## Best Practices

### During Purchasing
- Reference setup quantities when planning purchases
- Check structure locations for material delivery planning
- Verify efficiency values match expectations
- Review all setups to understand total production

### Setup Verification
- Confirm all setups are displayed
- Verify structure information is correct
- Check production quantities match planning
- Ensure efficiency values are appropriate

## Related Documentation

- [Setups](../planning/setups) - Detailed setup configuration
- [purchasing data panel](purchasing%20data%20panel) - Cost overview
- [material cards](material%20cards) - Material tracking
- [Purchasing Stage Overview](../purchasing) - General purchasing stage information
