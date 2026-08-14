# Invention Costs Card

The Invention Costs Card allows you to track additional costs associated with invention processes for certain item types. It appears only for items that require invention (T2 items and specific exceptions) and provides a way to record invention-related expenses.

## Overview

The Invention Costs Card provides:
- Invention cost tracking for T2 and special items
- Cost entry for individual invention items
- Total cost display showing sum of all invention costs
- Cost management with ability to add and remove entries

## Card Visibility

The card only appears when:
- Item requires invention: Item is a T2 item (meta level that requires invention)
- OR special exception: Item is in the exception list for invention costs
- Hidden otherwise: Card doesn't appear for standard manufacturing items

## Card Display

### Invention Icon
- Image: Invention icon/logo
- Size: 32px on mobile, 64px on desktop
- Background: Primary theme color
- Position: Centered at top of card

### Title
- Text: "Invention Costs"
- Position: Below icon
- Format: Subtitle style

### Total Cost Display
- Label: "Total Cost:"
- Value: Sum of all invention cost entries
- Format: Locale-formatted currency
- Calculation: Sum of all `itemCost` values from invention entries
- Purpose: Quick reference for total invention expenses

## Cost Entries Display

### Entry Chips
Each invention cost is displayed as a chip:
- Format: "Item Name Cost"
- Style: Outlined chip with delete icon
- Color: Secondary theme color
- Delete Icon: Red X icon on the right
- Behavior: 
  - Click delete to remove entry
  - Updates total cost automatically
  - Shows confirmation via snackbar

### Scrollable Area
- Height: 7vh (viewport height based)
- Scrollable: If entries exceed visible area
- Layout: Centered chips in vertical stack

## Adding Invention Costs

### Entry Form
Located at the bottom of the card:

#### Item Name Field
- Type: Text input
- Label: "Item"
- Required: Yes
- Validation: 
  - Only allows alphanumeric characters and spaces
  - Removes special characters automatically
- Purpose: Name of the invention item (e.g., "Datacore", "Decryptor")

#### Item Price Field
- Type: Number input
- Label: "Item Price"
- Required: Yes
- Default: 0
- Step: 0.01 (allows decimal values)
- Validation: Must be a valid number
- Purpose: Cost of the invention item

#### Add Button
- Icon: Plus (+) icon
- Color: Primary theme color
- Type: Submit button for form
- Behavior: 
  - Validates both fields are filled
  - Adds entry to invention costs
  - Resets form after submission
  - Shows success notification

### Form Submission
1. Enter item name (e.g., "Datacore - Minmatar Starship Engineering")
2. Enter item price
3. Click add button (plus icon)
4. Entry is added to the list
5. Total cost updates automatically
6. Form resets for next entry

## Cost Management

### Removing Entries
1. Click the delete icon (red X) on any cost chip
2. Entry is removed immediately
3. Total cost recalculates
4. Confirmation message appears

### Editing Entries
- Not directly editable: Entries cannot be edited in place
- Workaround: Delete and re-add with corrected values
- Best practice: Double-check values before adding

## Use Cases

### T2 Manufacturing
When manufacturing T2 items:
1. Card appears automatically
2. Add datacore costs
3. Add decryptor costs (if used)
4. Add any other invention-related expenses
5. Track total invention costs

### Cost Planning
- Record expected invention costs
- Track actual invention expenses
- Compare planned vs. actual costs
- Include in total job cost calculations

### Cost Analysis
- Review total invention costs
- Compare to material costs
- Evaluate invention efficiency
- Make informed decisions about T2 production

## Cost Integration

### Job Cost Calculations
- Invention costs are included in total job costs
- Separate from material purchase costs
- Separate from installation costs
- Tracked independently for analysis

### Cost Breakdown
Total job cost includes:
- Material purchase costs
- Installation costs
- Invention costs (this card)
- Extras costs

## Best Practices

### Cost Entry
- Enter costs as you acquire invention materials
- Use descriptive item names
- Record accurate prices
- Review entries regularly

### Cost Tracking
- Keep invention costs separate from material costs
- Review total invention costs
- Compare to market values
- Track cost trends over time

### Planning
- Estimate invention costs before starting
- Factor into profitability calculations
- Consider invention success rates
- Plan for multiple invention attempts if needed

## Related Documentation

- [purchasing data panel](purchasing%20data%20panel) - Total cost overview
- [material cards](material%20cards) - Material cost tracking
- [Purchasing Stage Overview](../purchasing) - General purchasing stage information
