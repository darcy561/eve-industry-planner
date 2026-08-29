# Extras Panel

The Extras Panel allows you to add or remove additional costs that weren't captured during purchasing or building stages. This includes costs like hauling fees, manual installation costs for older jobs, or any other expenses related to the job.

## Overview

The Extras Panel provides:
- **Extra cost tracking** for expenses not captured elsewhere
- **Categorised costs** using custom categories for organisation
- **Cost entry** with description and amount
- **Cost management** with ability to add and remove entries
- **Total calculation** showing sum of all extra costs

## Panel Display

### Title
- **Text**: "Extra Costs"
- **Position**: Panel header

## Existing Extra Costs

### Cost Entries
Each extra cost is displayed as a card showing:

#### Category Chip
- **Display**: Category label as a filled chip
- **Color**: Secondary theme color
- **Size**: Small chip with category name
- **Purpose**: Organises costs by category

#### Description
- **Display**: Text description of the cost
- **Format**: Single line, truncated if too long
- **Purpose**: Explains what the cost is for

#### Cost Amount
- **Display**: Formatted currency value
- **Format**: Locale-formatted with ISK suffix
- **Position**: Right side of card

#### Delete Button
- **Icon**: Delete (trash) icon
- **Color**: Error (red)
- **Function**: Removes the extra cost entry
- **Behaviour**: 
  - Removes entry immediately
  - Updates total costs
  - Shows confirmation message

### Entry Layout
- **Background**: Hover color for visual separation
- **Border**: Divider border for definition
- **Spacing**: Consistent gap between entries
- **Padding**: Comfortable internal spacing

## Adding Extra Costs

### Entry Form
Located below existing costs:

#### Category Selector
- **Type**: Dropdown select
- **Label**: Category selection
- **Options**: Custom categories from application settings
- **Default**: "Unassigned" (category ID 0)
- **Purpose**: Organise costs by type (e.g., "Hauling", "Fees", "Other")

#### Description Field
- **Type**: Text input
- **Label**: "Description"
- **Placeholder**: "Enter description..."
- **Required**: Yes (if category is Unassigned)
- **Validation**: 
  - Required if category is 0 (Unassigned)
  - Sanitised to remove HTML/special characters
- **Purpose**: Describe what the cost is for

#### Cost Field
- **Type**: Number input
- **Label**: "Cost"
- **Placeholder**: "0.00"
- **Required**: Yes
- **Step**: 0.01 (allows decimal values)
- **Min**: 0
- **Validation**: Must be greater than 0
- **Tooltip**: Shows short text format of value
- **Purpose**: Enter the cost amount in ISK

#### Add Button
- **Icon**: Plus (+) icon
- **Color**: Primary theme color
- **Type**: Icon button
- **Disabled State**: 
  - Disabled if description empty (when category is Unassigned)
  - Disabled if cost is 0 or less
- **Behaviour**: 
  - Validates inputs
  - Adds entry to list
  - Resets form
  - Shows success notification

### Form Submission
1. Select category (optional, defaults to Unassigned)
2. Enter description (required if category is Unassigned)
3. Enter cost amount
4. Click add button
5. Entry is added to the list
6. Total costs update automatically
7. Form resets for next entry

## Cost Categories

### Category System
- **Custom Categories**: Defined in application settings
- **Unassigned**: Default category (ID 0) for uncategorized costs
- **Organisation**: Helps group similar costs together
- **Filtering**: Can filter costs by category in other views

### Common Use Cases
- **Hauling Fees**: Transport costs for materials or products
- **Manual Installation**: Costs for jobs not in ESI data
- **Fees**: Broker fees, transaction fees, etc.
- **Adjustments**: Cost corrections or adjustments
- **Other**: Miscellaneous expenses

## Cost Management

### Removing Entries
1. Click delete icon on any cost entry
2. Entry is removed immediately
3. Total costs recalculate
4. Confirmation message appears

### Editing Entries
- **Not directly editable**: Entries cannot be edited in place
- **Workaround**: Delete and re-add with corrected values
- **Best practice**: Double-check values before adding

## Total Cost Integration

### Cost Calculation
- Extra costs are included in total build costs
- Separate from material and installation costs
- Tracked independently for analysis
- Included in cost per item calculations

### Cost Breakdown
Total build cost includes:
- Material purchase costs
- Installation costs (from linked ESI jobs)
- **Extras costs** (this panel)
- Invention costs (if applicable)

## Best Practices

### Cost Entry
- Enter costs as they occur
- Use descriptive text for clarity
- Assign appropriate categories
- Review entries regularly

### Cost Tracking
- Keep extras separate from other costs
- Use categories to organise expenses
- Document unusual costs with descriptions
- Review totals before archiving

### Cost Planning
- Estimate extras before starting
- Factor into profitability calculations
- Track actual vs. estimated extras
- Use for future job planning

## Related Documentation

- [Build Stats Panel](build%20stats%20panel) - Viewing total costs including extras
- [Button Panel](button%20panel) - Job completion actions
- [Complete Stage Overview](../complete) - General complete stage information
