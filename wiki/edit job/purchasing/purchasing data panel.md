# Purchasing Data Panel

The Purchasing Data Panel provides an overview of material acquisition progress and total costs for the job. It displays key statistics, offers quick actions for material management, and provides controls for market data selection.

## Overview

The Purchasing Data Panel provides:
- **Progress tracking** showing how many materials are complete
- **Cost summaries** displaying total material costs and cost per item
- **Quick actions** for shopping lists and cost import
- **Market controls** for selecting market location and listing type
- **Display preferences** for hiding completed materials

## Statistics Display

### Total Complete Items
- **Format**: "Total Complete Items: X / Y"
- **X**: Number of materials that are fully acquired
- **Y**: Total number of materials required
- **Purpose**: Quick progress indicator showing acquisition status

### Total Material Cost
- **Label**: "Total Material Cost"
- **Value**: Sum of all material purchase costs
- **Format**: Locale-formatted currency
- **Calculation**: Sum of all `purchasedCost` values from all materials
- **Purpose**: Shows total expenditure on materials

### Current Cost Per Item
- **Label**: "Current Cost Per Item"
- **Value**: Average cost per produced item
- **Format**: Locale-formatted currency
- **Calculation**: `Total Material Cost ÷ Total Items Produced`
- **Purpose**: Shows unit cost efficiency

## Panel Controls

### Hide Completed Purchases
- **Type**: Toggle switch
- **Location**: Top section of controls
- **Function**: Hides materials that are marked as complete
- **Behaviour**: 
  - Saves preference to application settings
  - Updates display immediately
  - Persists across sessions
- **Use Case**: Focus on remaining materials when most are complete

### Shopping List Button
- **Location**: Middle section of controls
- **Visibility**: Only shown when not all materials are complete
- **Function**: Opens the [Shopping List dialogue](../dialogues/shopping%20list) for remaining materials
- **Tooltip**: "Displays a shopping list of the remaining materials needed."
- **Behaviour**: 
  - Generates shopping list for current job
  - Shows only materials that aren't complete
  - Opens in a dialogue window

### Import Costs From Multibuy Button
- **Location**: Middle section of controls
- **Visibility**: Only shown when not all materials are complete
- **Function**: Imports material costs from EVE Online multibuy clipboard data
- **Tooltip**: "Imports costs copied from the multibuy page in game."
- **Behaviour**:
  1. Reads clipboard data
  2. Parses multibuy format (item name and cost)
  3. Matches items to job materials by name
  4. Adds costs to matching materials
  5. Updates total costs automatically
- **Error Handling**: 
  - Shows error if no matching items found
  - Displays error message if clipboard format is invalid

### Market Location Selector
- **Location**: Right section of controls
- **Function**: Selects the market region for price data
- **Options**: Various EVE Online regions (The Forge, Domain, etc.)
- **Behaviour**: 
  - Saves selection to job layout preferences
  - Updates market price displays
  - Uses default market location if not previously set

### Market Listing Selector
- **Location**: Right section of controls
- **Function**: Selects the type of market listing to use
- **Options**: Typically "buy" or "sell" orders
- **Behaviour**: 
  - Saves selection to job layout preferences
  - Updates market price displays
  - Uses default listing type if not previously set

## Using the Panel

### Tracking Progress
1. Check "Total Complete Items" to see acquisition status
2. Monitor "Total Material Cost" as you add purchases
3. Review "Current Cost Per Item" to track efficiency

### Managing Materials

#### Using Shopping Lists
1. Click "Shopping List" button
2. Review remaining materials in the [Shopping List dialogue](../dialogues/shopping%20list)
3. Use the dialogue to import from assets or plan purchases

#### Importing Costs from Multibuy
1. In EVE Online, open the multibuy page
2. Copy the multibuy data to clipboard
3. Return to the application
4. Click "Import Costs From Multibuy"
5. Costs are automatically matched and added

### Market Data Selection
1. Select market location from dropdown
2. Select listing type (buy/sell)
3. Market prices update throughout the purchasing stage
4. Preferences are saved per job

## Best Practices

### Progress Monitoring
- Regularly check completion count
- Use "Hide Completed Purchases" to focus on remaining work
- Monitor cost per item to ensure profitability

### Cost Management
- Import costs from multibuy for accurate pricing
- Use shopping lists to plan bulk purchases
- Track total costs against budget

### Efficiency Tips
- Use multibuy import for quick cost entry
- Hide completed materials to reduce clutter
- Set appropriate market location for accurate prices

## Related Documentation

- [material cards](material%20cards) - Individual material tracking
- [Shopping List Dialogue](../dialogues/shopping%20list) - Generating shopping lists
- [Assets Dialogue](../dialogues/assets) - Importing from assets
- [Purchasing Stage Overview](../purchasing) - General purchasing stage information
