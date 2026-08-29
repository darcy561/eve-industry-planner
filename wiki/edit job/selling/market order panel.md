# Market Order Panel

The Market Order Panel manages linking and tracking of market sell orders from EVE Online. It provides two tabs for viewing available orders that can be linked and managing currently linked orders with status tracking and transaction filtering.

## Overview

The Market Order Panel provides:
- **Available Orders tab** showing sell orders from ESI API that match your item
- **Linked Orders tab** displaying currently connected orders with status and details
- **Order linking** to connect your job to active sell orders
- **Status tracking** showing order progress, completion, and cancellation
- **Transaction filtering** to filter linked transactions by order location

## Tab Navigation

### Tab Labels
- **Available Orders**: Shows count of available orders (e.g., "3 Available Orders")
- **Linked Orders**: Shows count of linked orders (e.g., "2 Linked Orders")

### Tab Selection
- **Default Tab**: 
  - Shows Linked Orders if orders exist
  - Shows Available Orders if no orders linked
- **Manual Switching**: Click tabs to switch between views

## Available Orders Tab

### Order Cards
Each available order is displayed as a card showing:

#### Order Information
- **Character/Corporation Avatar**: Portrait or logo of order owner
- **Items Remaining**: "X/Y Items Remaining" format
- **Price Per Item**: Order price in ISK
- **Location**: Station or structure name
- **Duration**: Order duration in days
- **Last Modified**: Date order was last updated

#### Order Linking
- **Link Button**: Plus icon with link symbol
- **Tooltip**: "Link Order To Job."
- **Function**: Links order to the job
- **Behaviour**:
  1. Calculates brokers fee based on character skills and standings
  2. Links order to job
  3. Adds brokers fee entry
  4. Updates linked orders count
  5. Moves order to Linked Orders tab
  6. Shows success notification

### Empty State
- **Message**: "There are no orders appearing on the API matching this item type."
- **Condition**: No matching sell orders found in ESI API
- **Possible Reasons**:
  - No sell orders exist for this item
  - Orders not synced with ESI API
  - Orders don't match item type

## Linked Orders Tab

### Order Cards
Each linked order displays:

#### Order Information
- **Character/Corporation Avatar**: Portrait or logo of order owner
- **Items Remaining**: "X/Y Items Remaining" format
- **Price Per Item**: Order price in ISK
- **Location**: Station or structure name
- **Duration**: Order duration in days

#### Order Status
Status indicators show order state:

##### Active
- **Background**: Primary color (blue)
- **Text**: "Active"
- **Meaning**: Order is currently active and selling

##### Complete
- **Background**: Success color (green)
- **Text**: "Complete"
- **Condition**: Order expired and volume remaining is 0
- **Meaning**: All items have been sold

##### Cancelled
- **Background**: Warning color (yellow/orange)
- **Text**: "Order Canceled"
- **Meaning**: Order was cancelled in EVE Online

##### Unable To Update
- **Background**: Error color (red)
- **Text**: "Unable To Update Order Information"
- **Condition**: Character data not available
- **Meaning**: Cannot fetch current order status

#### Order Management

##### Filter Button
- **Icon**: Filter icon (on/off)
- **Visibility**: Only shown when multiple orders are linked
- **Function**: Filters transactions by order location
- **Tooltip**: "Filter Transactions By Location"
- **Behaviour**:
  - Toggles location filter on/off
  - Filters linked transactions panel
  - Shows filtered icon when active

##### Unlink Button
- **Icon**: Unlink icon
- **Color**: Error (red)
- **Tooltip**: "Unlink Order From Job."
- **Function**: Removes order from job
- **Behaviour**:
  - Unlinks order from job
  - Removes associated transactions
  - Removes brokers fee
  - Updates linked orders count
  - Shows confirmation message

## Order Matching

Orders are matched based on:
- **Item Type**: Must match the job's item type ID
- **Order Type**: Only sell orders are shown
- **Character/Corporation**: Matches orders from your characters/corporations
- **Status**: Shows active, expired, and cancelled orders

## Brokers Fees

### Automatic Calculation
When an order is linked:
- **Brokers Fee**: Automatically calculated based on:
  - Character skills (Broker Relations)
  - Character standings with station owner
  - Order price and duration
- **Fee Entry**: Created and linked to order
- **Total Tracking**: Included in total brokers fees

### Fee Display
- Brokers fees shown in Sales Stats Panel
- Included in total job costs
- Tracked per order
- Updates if order is unlinked

## Transaction Filtering

### Location-Based Filtering
- **Filter Button**: On each linked order card
- **Function**: Shows/hides transactions for that order's location
- **Purpose**: Focus on transactions for specific orders
- **Visual**: Filter icon changes when active

### Filtered Transactions
- Only transactions matching filtered locations are shown
- Helps track sales per order
- Useful when multiple orders are active
- Can filter multiple locations simultaneously

## Best Practices

### Linking Orders
- Link orders as soon as they're created in EVE Online
- Verify order details match your job
- Check brokers fees are calculated correctly
- Link all relevant orders

### Monitoring Orders
- Regularly check Linked Orders tab
- Monitor order status (active, complete, cancelled)
- Watch items remaining count
- Track order progress

### Transaction Management
- Use location filters to focus on specific orders
- Review transactions per order
- Track sales progress
- Verify all sales are recorded

## Related Documentation

- [Linked Transaction Panel](linked%20transaction%20panel) - Viewing transactions for orders
- [Sales Stats Panel](sales%20stats%20panel) - Profitability including brokers fees
- [Selling Stage Overview](../selling) - General selling stage information
