# Sales Stats Panel

The Sales Stats Panel provides comprehensive sales and profitability statistics for the job. It displays total costs, sales revenue, fees, and calculates profit/loss to help you understand the financial performance of your production.

## Overview

The Sales Stats Panel provides:
- **Complete cost breakdown** including all costs and fees
- **Sales revenue tracking** from linked transactions
- **Fee calculations** for brokers fees and transaction taxes
- **Profitability analysis** with profit/loss calculations
- **Performance metrics** including average sale price

## Statistics Display

### Total Items Produced
- **Label**: "Total Items Produced"
- **Value**: Total quantity of items built
- **Format**: Locale-formatted number (no decimals)
- **Calculation**: Sum of production from all setups
- **Purpose**: Shows total production output

### Total Build Cost
- **Label**: "Total Build Cost"
- **Value**: Complete build cost including all components
- **Format**: Locale-formatted currency
- **Calculation**: `Total Material Cost + Total Install Costs + Total Extras`
- **Purpose**: Shows complete cost of production

### Brokers Fee Total
- **Label**: "Brokers Fee Total"
- **Value**: Sum of all brokers fees from linked orders
- **Format**: Locale-formatted currency
- **Calculation**: Sum of brokers fees from all linked market orders
- **Purpose**: Shows total brokers fees paid

### Transaction Fee Total
- **Label**: "Transaction Fee Total"
- **Value**: Sum of all transaction taxes from sales
- **Format**: Locale-formatted currency
- **Calculation**: Sum of tax amounts from all linked transactions
- **Purpose**: Shows total transaction fees paid

### Total Job Cost
- **Label**: "Total Job Cost"
- **Value**: Complete cost including all fees
- **Format**: Locale-formatted currency
- **Calculation**: `Total Build Cost + Brokers Fee Total + Transaction Fee Total`
- **Purpose**: Shows complete cost including all fees

### Total Cost Per Item
- **Label**: "Total Cost Per Item"
- **Value**: Average cost per item including all fees
- **Format**: Locale-formatted currency (rounded to 2 decimals)
- **Calculation**: `Total Job Cost ÷ Total Items Produced`
- **Purpose**: Shows unit cost including all fees

### Total Of Sales
- **Label**: "Total Of Sales"
- **Value**: Sum of all sales revenue
- **Format**: Locale-formatted currency
- **Calculation**: Sum of `amount` from all linked transactions
- **Purpose**: Shows total revenue from sales

### Average Sale Price Per Item
- **Label**: "Average Sale Price Per Item"
- **Value**: Average price per item sold
- **Format**: Locale-formatted currency (rounded to 2 decimals)
- **Calculation**: `Total Of Sales ÷ Total Quantity Sold`
- **Purpose**: Shows average selling price
- **Note**: Shows 0.0 if no transactions linked

### Profit/Loss
- **Label**: "Profit/Loss"
- **Value**: Net profit or loss
- **Format**: Locale-formatted currency
- **Calculation**: `Total Of Sales - Total Job Cost`
- **Color Coding**:
  - **Red**: Loss (sales < total cost)
  - **Primary** (blue): Profit (sales > total cost)
- **Purpose**: Shows final profitability

## Layout

### Display Format
- **Two-column layout**: Label on left, value on right
- **Responsive**: Stacks on mobile, side-by-side on desktop
- **Spacing**: Consistent spacing between rows
- **Alignment**: Values aligned right for easy comparison

## Cost Components

### Build Costs
- Material purchase costs
- Installation costs from ESI jobs
- Extras costs
- Invention costs (if applicable)

### Selling Costs
- Brokers fees from market orders
- Transaction fees from sales
- Total selling expenses

### Total Costs
- All build costs
- All selling costs
- Complete cost of production and sale

## Profitability Analysis

### Profit Calculation
- **Formula**: Sales Revenue - Total Job Cost
- **Positive**: Profit (green/blue)
- **Negative**: Loss (red)
- **Break-even**: When sales equal costs

### Performance Metrics
- **Cost per item**: Unit production cost
- **Average sale price**: Unit selling price
- **Profit margin**: Difference between sale price and cost
- **Total profit**: Overall profitability

## Using the Panel

### Profitability Review
1. Check total job cost (all expenses)
2. Review total of sales (revenue)
3. Calculate profit/loss
4. Analyse performance

### Cost Analysis
1. Review build costs
2. Check brokers fees
3. Review transaction fees
4. Verify total costs

### Performance Evaluation
1. Compare cost per item to sale price
2. Review profit margins
3. Analyse fee impact
4. Make informed decisions

## Best Practices

### Regular Monitoring
- Check sales stats as transactions are linked
- Monitor profit/loss trends
- Review fee impact
- Track performance over time

### Cost Optimisation
- Review build costs for efficiency
- Minimise brokers fees where possible
- Track transaction fees
- Optimise for profitability

### Profitability Analysis
- Compare to market prices
- Review profit margins
- Analyse cost components
- Use for future planning

## Related Documentation

- [Market Order Panel](market%20order%20panel) - Linking orders and tracking brokers fees
- [Linked Transaction Panel](linked%20transaction%20panel) - Tracking sales transactions
- [Selling Stage Overview](../selling) - General selling stage information
