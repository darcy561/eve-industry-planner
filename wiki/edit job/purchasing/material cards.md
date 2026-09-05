# Material Cards

Material Cards are the primary interface for tracking individual material acquisition in the purchasing stage. Each material required by the job is displayed as a card showing quantities, costs, child job relationships, and completion status.

## Overview

Each Material Card provides:
- **Material identification** with icon and name
- **Quantity tracking** showing required, purchased, and remaining amounts
- **Cost management** for recording purchase costs
- **Child job integration** for materials produced via other jobs
- **Completion status** indicating when materials are fully acquired
- **Quick actions** for adding costs and managing child jobs

## Card Header

### Material Icon and Name
- **Icon**: Visual representation of the material (32px on mobile, 32px on desktop)
- **Name**: Material/item name
  - Clickable to open material information popover
  - Truncates with ellipsis on smaller screens
  - Full name visible on hover

### Action Buttons

#### Assets Button
- **Icon**: Assets icon button
- **Visibility**: Only shown when logged in
- **Function**: Opens the [Assets dialogue](../dialogues/assets) for this material
- **Purpose**: View available assets and import quantities

#### Child Jobs Avatar
- **Display**: Circular avatar showing number of linked child jobs
- **Visibility**: Only shown for buildable materials (manufacturing/reaction)
- **Color**: Primary theme color
- **Content**: Number of child jobs linked to this material
- **Tooltip**: "Number of child jobs linked, click to add or remove."
- **Function**: Opens child job dialogue when clicked
- **Behaviour**: Shows count of linked child jobs

## Quantity Information

### Single Row Display (No Child Jobs)
Shown when material has no linked child jobs:
- **Total Needed**: Total quantity required
- **Remaining**: Quantity still needed (Total - Purchased)
- **Tooltip**: Shows detailed breakdown with short text format

### Double Row Display (With Child Jobs)
Shown when material has linked child jobs:
- **Row 1**: Total Needed - total quantity required
- **Row 2**: 
  - "From Child Jobs: X | Remaining: Y" if child jobs exist
  - "Remaining: X" if no child jobs
- **Tooltip**: Shows child job production totals and remaining calculations

### Quantity Calculations

#### Without Child Jobs
- **Remaining** = Total Needed - Purchased

#### With Child Jobs
- **From Child Jobs**: Total quantity produced by linked child jobs
- **Remaining**: Total Needed - Child Job Production
- **Remaining to Purchase**: Remaining - Purchased

## Cost Display

### Total Cost
- **Label**: "Total Cost: X ISK"
- **Value**: Sum of all purchase costs for this material
- **Format**: Locale-formatted currency
- **Tooltip**: Shows total cost in short text format
- **Calculation**: Sum of all `itemCount × itemCost` from purchasing entries

## Cost Entries

### Cost Chips
Each purchase is displayed as a chip showing:
- **Format**: "Quantity @ Price ISK Each"
- **Color**: 
  - **Primary** (blue): Costs imported from child jobs
  - **Secondary** (default): Manually entered costs
- **Delete Button**: Red X icon to remove the cost entry
- **Behaviour**: 
  - Click delete to remove cost entry
  - Updates total costs automatically
  - Recalculates material completion status

### Cost Entry Display
- **Scrollable**: If more than 2 cost entries, area becomes scrollable
- **Layout**: Wrapped chips in a flex container
- **Spacing**: Consistent gap between chips

## Adding Costs

### Add Cost Form
- **Visibility**: Only shown when material is not complete
- **Fields**:
  - **Quantity**: Number input for quantity purchased
  - **Price**: Number input for price per unit
- **Add Button**: Plus icon to submit the form
- **Initial Values**:
  - Quantity: Calculated remaining needed (accounting for child jobs)
  - Price: Current market price from selected market location/listing

### Cost Entry Logic

#### Without Child Jobs
- Form shown when: Purchased < Total Needed
- Initial quantity: Total Needed - Purchased

#### With Child Jobs
- Form shown when: 
  - Child jobs don't cover requirement AND shortfall not fully purchased
  - OR child jobs cover requirement but costs not yet imported
- Initial quantity: Calculated based on shortfall

### Submitting Costs
1. Enter quantity and price
2. Click add button (plus icon)
3. Cost entry is added to material
4. Total costs update automatically
5. Completion status recalculates
6. Form resets with new initial values

## Child Job Integration

### Awaiting Cost Import Box
- **Visibility**: Shown when child jobs exist but costs haven't been imported
- **Condition**: 
  - Child jobs produce enough to cover requirement: Always shown if costs not imported
  - Child jobs don't cover: Only shown after shortfall is purchased
- **Display**: "Awaiting Cost Import" message in primary color
- **Purpose**: Reminds you to import costs from completed child jobs

### Child Job Cost Import
- Child jobs can automatically import costs when completed
- Costs appear as primary-colored chips
- Imported costs are linked to specific child job IDs
- Helps track production costs from child jobs

## Completion Status

### Complete Box
- **Display**: Green box with "Complete" text
- **Visibility**: Only shown when material is fully acquired
- **Color**: Manufacturing theme color (green)

### Completion Logic

#### Without Child Jobs
- **Complete when**: Purchased ≥ Total Needed

#### With Child Jobs (Cover Requirement)
- **Complete when**: All child job costs imported (no remaining to import)

#### With Child Jobs (Don't Cover Requirement)
- **Complete when**: 
  - Shortfall purchased (Purchased ≥ Shortfall)
  - AND all child job costs imported

## Material Sorting

Materials are automatically sorted:
1. **Incomplete materials first**: Materials not yet complete
2. **Complete materials last**: Materials marked as complete
3. **Original order preserved**: Within each group, maintains original material order

## Card Layout

### Responsive Design
- **Mobile**: Full width, stacked layout
- **Tablet**: 2 columns
- **Desktop**: 3-4 columns depending on screen size
- **Card Height**: Minimum height adapts to content

### Scrollable Areas
- **Cost Entries**: Scrollable if more than 2 entries
- **Card Content**: Flexible layout with proper overflow handling

## Using Material Cards

### Recording Purchases
1. Review quantity information to see what's needed
2. Enter quantity and price in the add cost form
3. Click add button to record purchase
4. Review cost chips to verify entry
5. Check completion status

### Managing Child Jobs
1. Click child jobs avatar (if material is buildable)
2. Review linked child jobs in dialogue
3. Add or remove child job links
4. Import costs when child jobs complete

### Tracking Progress
1. Check quantity information for remaining amounts
2. Review total cost to track spending
3. Monitor completion status
4. Use "Awaiting Cost Import" reminder when needed

## Best Practices

### Cost Entry
- Enter costs as you make purchases
- Use market prices as starting point
- Review cost chips to verify accuracy
- Import from child jobs when available

### Child Job Management
- Link child jobs early in planning
- Import costs when child jobs complete
- Monitor "Awaiting Cost Import" reminders
- Verify child job production covers requirements

### Progress Tracking
- Regularly check completion status
- Review remaining quantities
- Monitor total costs per material
- Use completion indicators to prioritise work

## Related Documentation

- [purchasing data panel](purchasing%20data%20panel) - Overview and statistics
- [child job dialogue](child%20job%20dialogue) - Managing child job links
- [Shopping List Dialogue](../dialogues/shopping%20list) - Generating shopping lists
- [Assets Dialogue](../dialogues/assets) - Importing from assets
- [Purchasing Stage Overview](../purchasing) - General purchasing stage information
