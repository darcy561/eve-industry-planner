# Available Transactions Panel

The Available Transactions Panel displays new transactions from the ESI API that match your linked market orders. It allows you to link sales transactions to track actual revenue and complete the sales tracking process.

## Overview

The Available Transactions Panel provides:
- **New transaction detection** finding sales that match your market orders
- **Transaction details** showing date, description, quantity, price, and amount
- **Transaction linking** to connect sales to your job
- **Bulk linking** to link all matching transactions at once
- **Real-time updates** as new transactions appear in ESI API

## Panel Display

### Title
- **Text**: "New Transactions"
- **Position**: Panel header

### Loading and Error States
- **Loading**: Shows loading indicator while fetching transaction data
- **Error**: Displays error message if transaction data cannot be loaded
- **Sources**: Fetches from character and corporation transactions, journals, and market orders

## Transaction Display

### Transaction Rows
Each available transaction is displayed as a row showing:

#### Character/Corporation Avatar
- **Display**: Portrait or corporation logo
- **Size**: 24px on mobile, 32px on desktop
- **Tooltip**: Shows character or corporation name
- **Purpose**: Identifies who made the sale

#### Date
- **Display**: Transaction date
- **Format**: Locale-formatted date
- **Position**: Second column
- **Purpose**: Shows when sale occurred

#### Description
- **Display**: Transaction description
- **Content**: Typically item name or sale description
- **Position**: Third column
- **Purpose**: Identifies what was sold

#### Quantity and Price
- **Display**: "Quantity @ Price" format
- **Format**: Locale-formatted numbers
- **Position**: Fourth column
- **Purpose**: Shows quantity sold and unit price

#### Amount
- **Display**: Total transaction amount
- **Format**: Locale-formatted currency
- **Position**: Fifth column
- **Purpose**: Shows total revenue from transaction

#### Tax
- **Display**: Transaction fee/tax amount
- **Format**: Locale-formatted currency with minus sign
- **Position**: Sixth column (hidden on mobile)
- **Purpose**: Shows transaction fees paid

#### Link Button
- **Icon**: Plus (+) icon
- **Color**: Primary theme color
- **Function**: Links transaction to the job
- **Tooltip**: "Link Transaction"
- **Behavior**:
  - Links transaction to active market order
  - Adds to linked transactions
  - Updates sales stats
  - Shows success notification
  - Removes from available list

## Transaction Matching

Transactions are matched based on:
- **Item Type**: Must match the job's item type ID
- **Market Orders**: Must match one of your linked market orders
- **Location**: Must match order location
- **Character/Corporation**: Matches your characters/corporations
- **Date Range**: Recent transactions from ESI API

## Bulk Linking

### Link All Button
- **Visibility**: Shown when multiple transactions are available
- **Label**: "Link All"
- **Function**: Links all available transactions at once
- **Behavior**:
  - Links all transactions to active order
  - Updates sales stats with all sales
  - Shows success notification
  - Removes all from available list

## Empty State
- **Message**: "There are currently no new transactions matching your order to display."
- **Condition**: No matching transactions found
- **Possible Reasons**:
  - No sales have occurred yet
  - Transactions don't match order criteria
  - ESI API data not synced
  - Orders not linked yet

## Transaction Data Sources

Transactions are found from:
- **Character Transactions**: Wallet transactions from your characters
- **Corporation Transactions**: Wallet transactions from your corporations
- **Character Journals**: Journal entries that may contain sales
- **Corporation Journals**: Corporation journal entries
- **Market Orders**: Cross-referenced with linked market orders

## Using the Panel

### Linking Transactions
1. Review available transactions list
2. Verify transaction details match your sales
3. Click link button on individual transactions
4. Or click "Link All" to link all at once
5. Transactions move to Linked Transactions panel
6. Sales stats update automatically

### Transaction Verification
- Check dates match your sales
- Verify quantities are correct
- Confirm prices match expectations
- Review amounts for accuracy

### Sales Tracking
- Link transactions as they appear
- Track all sales for complete revenue
- Monitor transaction fees
- Ensure accurate profit/loss calculations

## Best Practices

### Regular Linking
- Check for new transactions regularly
- Link transactions as they appear
- Verify transaction details
- Keep sales tracking up to date

### Transaction Verification
- Review transaction details before linking
- Verify amounts are correct
- Check dates match actual sales
- Confirm quantities match orders

### Complete Tracking
- Link all matching transactions
- Ensure no sales are missed
- Track transaction fees
- Maintain accurate records

## Related Documentation

- [Linked Transaction Panel](linked%20transaction%20panel) - Viewing linked transactions
- [Market Order Panel](market%20order%20panel) - Managing market orders
- [Sales Stats Panel](sales%20stats%20panel) - Profitability analysis
- [Selling Stage Overview](../selling) - General selling stage information
