# Setups

Job setups allow you to configure multiple manufacturing configurations for a single job. Each setup defines where and how the job will be executed, including structure type, location, efficiency settings, and character assignment. A job can have multiple setups, allowing you to split production across different structures, systems, or characters.

## Overview

Setups are essential for:
- **Splitting production** across multiple structures or locations
- **Optimizing costs** by using different structures with varying tax rates
- **Managing capacity** by distributing jobs across multiple facilities
- **Character assignment** for jobs that require specific skills or access

## Setup Panel

The Setup Panel displays all configured setups for the current job. Each setup is shown as a card that you can click to edit.

### Panel Controls

#### Add Setup Button
- **Location**: Top-left corner of the panel
- **Icon**: Plus (+) icon
- **Function**: Creates a new setup with default values
- **Behavior**: Immediately adds the new setup to the job and displays a success notification

#### Menu Button
- **Location**: Top-right corner of the panel
- **Icon**: Three vertical dots (⋮)
- **Function**: Opens a context menu with setup management options

##### Menu Options

**Delete Active Setup**
- Removes the currently selected setup from the job
- **Restriction**: Cannot delete the final setup - you must create a replacement setup first
- **Warning**: If attempted on the last setup, displays a warning message: "Cannot delete the final setup. Create a replacement setup first."

#### Wiki Link Button
- **Location**: Top-right corner, next to the menu button
- **Function**: Opens this documentation page

## Setup Cards

Each setup is displayed as a card showing key information at a glance. Cards are arranged in a responsive grid layout.

### Card Information

#### Manufacturing Jobs
For manufacturing jobs, each card displays:

- **ME (Material Efficiency)**: The material efficiency level for this setup
- **TE (Time Efficiency)**: The time efficiency level (displayed as TE × 2)
- **Runs**: Number of blueprint runs configured for this setup
- **Jobs**: Number of job slots this setup will use
- **Character**: The assigned character name (or "No Matching Character Found" if invalid)
- **Structure Information**: Either custom structure name or default structure details
- **Estimated Install Costs**: Total estimated installation costs for all jobs in this setup

#### Non-Manufacturing Jobs
For reaction and other job types, cards display:
- **Runs**: Number of runs configured
- **Jobs**: Number of job slots
- **Character**: Assigned character name
- **Structure Information**: Structure details
- **Estimated Install Costs**: Total installation costs

### Structure Display

#### Custom Structures
If a custom structure is assigned:
- Shows the custom structure name
- Displays system index value in a tooltip on hover
- Shows "Missing Structure" if the custom structure no longer exists

#### Default Structures
If using default structure selection:
- **System Type**: The type of system (e.g., Highsec, Lowsec, Nullsec, Wormhole)
- **Structure Type**: The structure type (e.g., Engineering Complex, Citadel)
- **Rig Type**: The rig configuration
- **System Name**: The specific system where the job will run
- **System Index**: Displayed in a tooltip showing the system index percentage
- **Tax**: The tax percentage configured for this setup

### Card Interaction

- **Click**: Selects the setup for editing
- **Active Indicator**: The active setup (being edited) shows a colored border at the bottom matching the job type color
- **Hover**: Tooltips provide additional information:
  - Install cost per job (on estimated costs line)
  - System index value (on system name/structure name)

## Edit Setup Panel

The Edit Setup Panel appears when you click on a setup card. It provides detailed controls for configuring all aspects of the setup.

### Basic Configuration

#### Blueprint Runs
- **Field**: Number input
- **Function**: Sets how many blueprint runs this setup will execute
- **Behavior**: Automatically recalculates job materials and costs when changed

#### Job Slots
- **Field**: Number input
- **Function**: Sets how many job slots this setup will consume
- **Behavior**: Automatically recalculates job materials and costs when changed

### Efficiency Settings (Manufacturing Only)

These fields only appear for manufacturing job types.

#### Material Efficiency (ME)
- **Field**: Dropdown select
- **Function**: Sets the material efficiency level (0-10)
- **Impact**: Affects material consumption - higher ME reduces material requirements
- **Behavior**: Automatically recalculates material requirements when changed

#### Time Efficiency (TE)
- **Field**: Dropdown select
- **Function**: Sets the time efficiency level (0-20)
- **Impact**: Affects job duration - higher TE reduces manufacturing time
- **Behavior**: Automatically recalculates job time when changed

### Structure Configuration

You can choose between using a custom structure or manually configuring structure settings.

#### Custom Structure Selection
- **Field**: Dropdown select
- **Availability**: Only visible when logged in
- **Function**: Selects a pre-configured custom structure
- **Behavior**: 
  - When selected, hides manual structure configuration fields
  - Automatically applies the custom structure's settings
  - Recalculates job parameters based on structure properties

#### Manual Structure Configuration

These fields appear when no custom structure is selected:

**Structure Type**
- **Field**: Dropdown select
- **Function**: Selects the type of structure (e.g., Engineering Complex, Citadel)
- **Options**: Filtered by job type
- **Behavior**: Recalculates job parameters when changed

**Rig Type**
- **Field**: Dropdown select
- **Function**: Selects the rig configuration for the structure
- **Options**: Filtered by job type and structure type
- **Behavior**: Recalculates job parameters when changed

**System Type**
- **Field**: Dropdown select
- **Function**: Selects the security class of the system (Highsec, Lowsec, Nullsec, Wormhole)
- **Behavior**: Recalculates job parameters when changed

**System Search**
- **Field**: Autocomplete search
- **Function**: Searches and selects a specific EVE Online system
- **Features**: 
  - Virtualized list for performance with large datasets
  - Filters systems based on job type
  - Shows loading indicator while fetching system data
- **Behavior**: Recalculates job parameters when changed

**Tax Percentage**
- **Field**: Number input
- **Function**: Sets the tax rate for this setup (0-100%)
- **Behavior**: 
  - Updates on blur (when field loses focus)
  - Recalculates installation costs when changed

### System Index Configuration

#### Use Alternative System Index
- **Field**: Checkbox
- **Function**: Enables manual override of the system index value
- **Behavior**: 
  - When checked, enables the System Index field
  - When unchecked, uses the default system index and disables manual entry
  - Automatically recalculates job parameters

#### System Index
- **Field**: Number input
- **Function**: Manually sets the system index percentage
- **Availability**: Only enabled when "Use Alternative System Index" is checked
- **Behavior**: Recalculates job parameters when changed

### Character Assignment

#### Assign Character
- **Field**: Dropdown select
- **Availability**: Only visible when logged in
- **Function**: Assigns a character to execute this setup
- **Impact**: 
  - Used for skill-based calculations
  - Affects material requirements and job time
  - Useful for tracking which character will run the job
- **Behavior**: Recalculates job parameters based on character skills when changed

## Setup Management

### Creating Setups
1. Click the **Add Setup** button (plus icon) in the top-left of the Setup Panel
2. A new setup is created with default values
3. Click the setup card to edit its configuration
4. Configure all desired settings in the Edit Setup Panel

### Editing Setups
1. Click any setup card in the Setup Panel
2. The card becomes active (colored border indicator)
3. The Edit Setup Panel appears below
4. Modify any settings as needed
5. Changes are automatically saved and recalculated

### Deleting Setups
1. Click a setup card to make it active
2. Click the menu button (three dots) in the top-right of the Setup Panel
3. Select **Delete Active Setup**
4. The setup is removed (unless it's the last setup)

### Multiple Setups
- Jobs can have multiple setups
- Each setup operates independently
- Total production is the sum of all setups
- Useful for:
  - Splitting production across multiple structures
  - Using different tax rates in different systems
  - Distributing jobs across multiple characters
  - Managing capacity limits

## Automatic Recalculation

All setup changes automatically trigger recalculation of:
- Material requirements
- Job time estimates
- Installation costs
- System index values
- Structure requirements

This ensures your job planning always reflects the current setup configuration.

## Related Documentation

- [Planning Stage Overview](planning) - General planning stage information
- [Edit Job Overview](../edit-job) - Complete job editing guide
- [Custom Structures](../settings/custom-structures) - Configuring custom structures