# Material Prices

The Material Prices panel displays estimated market costs for all materials required by the job. It shows both purchase prices and build costs (when materials are produced via child jobs), helping you make informed decisions about whether to buy materials or produce them.

## Overview

The Material Prices panel provides:
- **Market price information** for all required materials
- **Build cost comparisons** showing whether it's cheaper to buy or produce materials
- **Total cost calculations** including installation costs and extras
- **Profit/loss analysis** comparing total costs to market value of products
- **Market location and listing type selection** for accurate price data

## Panel Controls

### Market Location Selector
- **Location**: Top-right corner of the panel
- **Function**: Selects the market region for price calculations
- **Options**: Various EVE Online regions (The Forge, Domain, etc.)
- **Behavior**: 
  - Saves selection to job layout preferences
  - Updates all price calculations immediately
  - Uses default market location if not previously set

### Market Listing Selector
- **Location**: Top-left area of the panel
- **Function**: Selects the type of market listing to use for prices
- **Options**: Typically "buy" or "sell" orders
- **Behavior**: 
  - Saves selection to job layout preferences
  - Updates all price calculations immediately
  - Uses default listing type if not previously set

## Material Price Header

The header section displays information about the item being produced:

### Product Information
- **Item Icon**: Visual representation of the product
- **Item Name**: Name of the item being manufactured
  - Clickable to open item information popover
- **Item Market Price**: Current market price per unit for the selected listing type
- **Total Market Price**: Total value of all items that will be produced

### Column Headers
- **Material [Listing] Price**: Price per unit for each material
- **Build Price**: Estimated cost to produce the material via child jobs (if applicable)
- **Total Material Price**: Total cost for all units needed
- **Total Build Price**: Total estimated cost if producing via child jobs

## Material Rows

Each material required by the job is displayed as a row with the following information:

### Material Information
- **Material Icon**: Visual representation of the material
- **Material Name**: Name of the material
  - Clickable to open material information popover
- **Info Icon** (if buildable): Appears for materials that can be produced (manufacturing/reaction jobs)
  - **Color**: 
    - Primary (blue) for normal materials
    - Warning (orange) for exempt materials
  - **Function**: Opens a popover comparing purchase cost vs. build cost

### Price Display

#### Material Market Price
- Shows the current market price per unit
- Based on selected market location and listing type
- Displayed in standard format

#### Build Price (if applicable)
- Shows estimated cost per unit to produce via child jobs
- Displayed in italics below market price
- Only shown for materials that can be produced (manufacturing/reaction)
- **Color coding**:
  - **Red**: Market price is higher than build cost (buying is more expensive)
  - **Green**: Market price is lower than build cost (buying is cheaper)
  - **No color**: Prices are equal or no child jobs exist

#### Total Material Price
- Shows total cost for all units needed
- Calculated as: `market price × quantity`
- **Color coding**:
  - **Red**: Market price total is higher than build cost total
  - **Green**: Market price total is lower than build cost total

#### Total Build Price (if applicable)
- Shows total estimated cost if producing via child jobs
- Calculated as: `build cost per unit × quantity`
- Only shown when child jobs exist for the material
- Displayed in italics below total material price

### Child Job Comparison Popover

Clicking the info icon opens a detailed comparison popover showing:
- Current market price vs. estimated build cost
- Options to create child jobs or link existing jobs
- Detailed cost breakdown
- Material requirements for building the item

## Material Totals Section

The totals section appears at the bottom of the material list and provides comprehensive cost analysis.

### Totals with Market Prices

This section shows costs when purchasing all materials from the market:

- **Total Material [Listing] Price**: Sum of all material purchase costs
- **Total Install Costs**: Sum of all installation fees for all setups
- **Total Cost**: Material costs + installation costs + extras
- **Total Cost Per Item**: Average cost per produced item
- **Profit/Loss**: Difference between total market value of products and total cost
  - **Color coding**:
    - **Green**: Profitable (cost < market value)
    - **Orange**: Marginally profitable (build cost < market cost, but still profitable)
    - **Red**: Unprofitable (cost > market value)

### Totals with Child Jobs

This section appears when child jobs exist and shows costs when producing materials:

- **Total Estimated Material Price With Child Jobs**: Sum of estimated build costs
- **Total Install Costs**: Sum of all installation fees
- **Total Estimated Cost With Child Jobs**: Build costs + installation + extras
- **Total Estimated Price Per Item With Child Jobs**: Average cost per item when producing materials
- **Profit/Loss**: Difference between market value and estimated build cost
  - **Color coding**:
    - **Green**: Profitable with child jobs
    - **Orange**: Marginally profitable (build cost > market cost, but still profitable overall)
    - **Red**: Unprofitable even with child jobs

## Understanding Price Comparisons

### When to Buy vs. Build

The panel helps you decide whether to purchase materials or produce them:

1. **Market Price < Build Price**: 
   - Buying is cheaper
   - Market price displays in green
   - Consider purchasing materials

2. **Market Price > Build Price**:
   - Building is cheaper
   - Market price displays in red
   - Consider creating child jobs

3. **Equal Prices**:
   - No color coding
   - Either option is equivalent

### Cost Analysis

The totals section provides two perspectives:

1. **Market Prices**: What it costs if you buy everything
2. **Child Jobs**: What it costs if you produce materials

Compare these to determine the most cost-effective approach for your production chain.

## Related Documentation

- [Planning Stage Overview](planning) - General planning stage information
- [Resources Panel](resources) - Viewing material requirements
- [Setups](setups) - Configuring job setups
- [Edit Job Overview](../edit-job) - Complete job editing guide
