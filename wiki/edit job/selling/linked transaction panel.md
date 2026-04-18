# Linked Transaction Panel

The Linked Transaction Panel displays all transactions that have been linked to the job. It allows you to view sales details, manage linked transactions, and manually add transactions that aren't available from the ESI API.

## Overview

The Linked Transaction Panel provides:
- **Linked transaction display** showing all sales transactions
- **Transaction details** with date, description, quantity, price, and fees
- **Transaction management** to unlink transactions if needed
- **Manual transaction entry** for sales not in ESI API
- **Location filtering** to filter by market order location

## Panel Display

### Title
- **Text**: "Linked Transactions"
- **Position**: Panel header

### Menu Button
- **Location**: Top-right corner
- **Icon**: Three vertical dots (⋮)
- **Function**: Opens context menu

#### Menu Options

**Add Manual Transaction**
- Opens dialogue to create custom transaction
- Use for sales not in ESI API
- Allows manual entry of all transaction details
- Links transaction to active market order

## Transaction Display

### Transaction Rows
Each linked transaction is displayed as a row showing:

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
- **Content**: Item name or sale description
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

#### Unlink Button
- **Icon**: Clear (X) icon
- **Color**: Error (red)
- **Function**: Unlinks transaction from job
- **Behavior**:
  - Removes transaction from linked list
  - Updates sales stats
  - Shows confirmation message
  - Transaction becomes available again (if still in ESI)

## Location Filtering

### Filtered Display
- **Filtering**: Transactions are filtered by active order locations
- **Active Orders**: Set in Market Order Panel using filter buttons
- **Display**: Only shows transactions matching filtered locations
- **Purpose**: Focus on transactions for specific orders

### Filter Behavior
- Transactions only show if their location matches active filters
- Multiple locations can be filtered simultaneously
- Filtering helps track sales per order
- Useful when multiple orders are active

## Manual Transaction Entry

### Add Manual Transaction Dialogue
Opens when "Add Manual Transaction" is selected from menu:

#### Date/Time Picker
- **Type**: DateTime picker
- **Default**: Current date/time
- **Function**: Set transaction date
- **Purpose**: Record when sale occurred

#### Description Field
- **Type**: Text input
- **Label**: "Description"
- **Validation**: Removes special characters
- **Purpose**: Describe the transaction

#### Item Cost Field
- **Type**: Number input
- **Label**: "Item Cost"
- **Suffix**: "ISK"
- **Function**: Enter price per unit
- **Behavior**: Auto-calculates total amount when quantity changes

#### Quantity Field
- **Type**: Number input
- **Label**: "Quantity"
- **Function**: Enter quantity sold
- **Behavior**: Auto-calculates total amount when price changes

#### Tax Or Fees Paid Field
- **Type**: Number input
- **Label**: "Tax Or Fees Paid"
- **Suffix**: "ISK"
- **Function**: Enter transaction fees
- **Purpose**: Record fees paid on sale

#### Dialogue Actions
- **Close Button**: Cancels transaction entry
- **Add Button**: Creates and links transaction
- **Behavior**: 
  - Creates transaction object
  - Links to active market order
  - Adds to linked transactions
  - Updates sales stats
  - Closes dialogue

## Empty State
- **Message**: "There are currently no transactions linked to this market order."
- **Condition**: No transactions are linked
- **Action**: Link transactions from Available Transactions panel or add manually

## Transaction Management

### Unlinking Transactions
1. Find transaction in linked list
2. Click unlink button (red X)
3. Transaction is removed
4. Sales stats update
5. Confirmation message appears

### Manual Entry
1. Click menu button (three dots)
2. Select "Add Manual Transaction"
3. Fill in transaction details
4. Click "Add" button
5. Transaction is created and linked

## Transaction Details

### Transaction Data
Each transaction includes:
- **Transaction ID**: Unique identifier
- **Date**: When sale occurred
- **Description**: Sale description
- **Quantity**: Items sold
- **Unit Price**: Price per item
- **Amount**: Total revenue
- **Tax**: Transaction fees
- **Location ID**: Where sale occurred
- **Character Hash**: Who made the sale
- **Order ID**: Linked market order (if applicable)

## Using the Panel

### Reviewing Sales
1. View all linked transactions
2. Review sales details
3. Check total revenue
4. Monitor transaction fees

### Managing Transactions
1. Unlink incorrect transactions
2. Add manual transactions for missing sales
3. Filter by location if needed
4. Keep records accurate

### Sales Tracking
- Ensure all sales are recorded
- Track transaction fees
- Monitor revenue totals
- Verify profit/loss calculations

## Best Practices

### Complete Tracking
- Link all sales transactions
- Add manual transactions for missing sales
- Verify all amounts are correct
- Keep records up to date

### Transaction Accuracy
- Review transaction details
- Verify dates match actual sales
- Check quantities are correct
- Confirm prices match orders

### Manual Entry
- Use for sales not in ESI API
- Enter accurate details
- Include all fees
- Link to correct orders

## Related Documentation

- [Available Transactions Panel](available%20transactions%20panel) - Finding new transactions
- [Market Order Panel](market%20order%20panel) - Managing orders and location filtering
- [Sales Stats Panel](sales%20stats%20panel) - Profitability analysis
- [Selling Stage Overview](../selling) - General selling stage information
