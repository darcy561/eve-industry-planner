# Resources Panel

The Resources Panel displays all raw materials and resources required for the job. It shows material quantities, tracks child job relationships, and provides tools for managing material acquisition through purchasing or child job creation.

## Overview

The Resources Panel provides:
- **Complete material list** showing all required resources
- **Quantity display** for each material
- **Child job tracking** indicating which materials have linked production jobs
- **Display mode selection** to view all setups or just the active setup
- **Bulk operations** for creating child jobs and copying material lists

## Panel Controls

### Display Type Selector
- **Location**: Top-left area of the panel
- **Function**: Switches between viewing all setups or just the active setup
- **Options**:
  - **Display All Setups**: Shows total quantities across all setups
  - **Display Selected Setup**: Shows quantities for the currently active setup only
- **Behavior**: 
  - Saves selection to job layout preferences
  - Updates all material quantities immediately
  - Affects volume calculations

### Menu Button
- **Location**: Top-right corner of the panel
- **Icon**: Three vertical dots (⋮)
- **Function**: Opens context menu with bulk operations

#### Menu Options

**Copy Resources List**
- Copies all materials and quantities to clipboard
- **Format**: "Material Name Quantity" (one per line)
- **Use Case**: 
  - Creating shopping lists
  - Sharing requirements with others
  - Importing into other tools

**Create All Child Jobs**
- Automatically creates child jobs for all buildable materials
- **Behavior**:
  - Only creates jobs for materials that can be produced (manufacturing/reaction)
  - Skips materials that already have child jobs
  - Links new jobs to the current job as parent
  - Assigns jobs to the same group if applicable
  - Fetches required market data and system indexes
  - Recalculates installation costs

## Material Rows

Each material is displayed as a row with status indicators and quantity information.

### Status Indicators

A colored icon on the left indicates the material's status:

#### Lens Icon (●)
- **Color**: Varies by material type
- **Meaning**: Material has no child job linked
- **Tooltip**: Shows material type (Base Material, Manufacturing Job, Reaction Job, Planetary Interaction)

#### Checkmark Icon (✓)
- **Color**: Varies by material type
- **Meaning**: Material has a child job linked or pending
- **Tooltip**: 
  - "Linked" for confirmed child jobs
  - "Pending" for temporary/pending child jobs

### Material Type Colors

The status icon color indicates the material type:
- **Manufacturing**: Manufacturing job type color
- **Reaction**: Reaction job type color
- **Planetary Interaction**: PI job type color
- **Base Material**: Base material color

### Material Information

#### Material Name
- **Display**: Material/item name
- **Interaction**: Clickable to open material information popover
- **Popover**: Shows item details, market information, and related data

#### Quantity
- **Display**: Formatted number showing required quantity
- **Format**: Locale-formatted with thousand separators
- **Calculation**: 
  - **All Setups**: Sum of quantities across all setups
  - **Selected Setup**: Quantity for active setup only

## Volume Calculation

### Total Volume
- **Location**: Bottom of the material list
- **Display**: Total volume in cubic meters (m³)
- **Calculation**: Sum of `material volume × quantity` for all materials
- **Display Mode**: Respects the selected display type (all setups vs. active setup)
- **Purpose**: 
  - Planning cargo capacity
  - Estimating transport requirements
  - Understanding storage needs

## Material Status States

### No Child Job
- **Icon**: Lens (●)
- **Color**: Material type color
- **Meaning**: Material must be purchased or child job created
- **Action**: Can create child job or purchase material

### Child Job Linked
- **Icon**: Checkmark (✓)
- **Color**: Material type color
- **Meaning**: Material has a confirmed child job
- **Action**: Child job exists and is linked

### Child Job Pending
- **Icon**: Checkmark (✓)
- **Color**: Warning (orange)
- **Meaning**: Child job is pending creation or linking
- **Action**: Child job will be created/linked when job is saved

## Using the Resources Panel

### Viewing Material Requirements

1. **Select Display Mode**:
   - "Display All Setups" to see total requirements
   - "Display Selected Setup" to see requirements for one setup

2. **Review Materials**:
   - Check status indicators to see which need child jobs
   - Review quantities to understand scale
   - Check total volume for transport planning

### Creating Child Jobs

#### Individual Materials
- Use the info icon in the Material Prices panel to create child jobs for specific materials
- Or use the child job management features in other panels

#### All Materials at Once
1. Click the menu button (three dots)
2. Select "Create All Child Jobs"
3. System automatically:
   - Identifies buildable materials
   - Creates child jobs for materials without existing jobs
   - Links jobs appropriately
   - Fetches required data

### Copying Material Lists

1. Click the menu button (three dots)
2. Select "Copy Resources List"
3. Material list is copied to clipboard
4. Paste into:
   - Shopping list tools
   - Spreadsheets
   - Communication tools
   - Other planning applications

## Display Mode Details

### Display All Setups
- Shows cumulative quantities across all setups
- Useful for:
  - Total material planning
  - Overall cost estimation
  - Complete shopping lists
  - Full production planning

### Display Selected Setup
- Shows quantities for the active setup only
- Useful for:
  - Setup-specific planning
  - Understanding individual setup requirements
  - Comparing setup material needs
  - Focused material acquisition

## Material Types

### Base Materials
- Cannot be produced via jobs
- Must be purchased or obtained through other means
- Examples: Minerals, ice products, basic components

### Manufacturing Jobs
- Can be produced via manufacturing jobs
- Can create child jobs to produce them
- Examples: Ships, modules, ammunition

### Reaction Jobs
- Can be produced via reaction jobs
- Can create child jobs to produce them
- Examples: Advanced materials, composite materials

### Planetary Interaction
- Produced via planetary interaction
- May have special handling
- Examples: PI materials, processed materials

## Related Documentation

- [Planning Stage Overview](planning) - General planning stage information
- [Material Prices](material%20prices) - Viewing material costs and comparisons
- [Setups](setups) - Configuring job setups that determine material quantities
- [Production Stats](production%20stats) - Understanding production output
- [Edit Job Overview](../edit%20job) - Complete job editing guide
