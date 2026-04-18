# Reprocessing Calculator

The Reprocessing Calculator is a powerful tool for calculating ore-to-mineral conversions and reverse mineral-to-ore calculations in EVE Online. It helps you optimize your reprocessing operations by considering structure types, skills, rigs, implants, and market prices.

## Overview

The Reprocessing Calculator supports two main calculation modes:

- **To Minerals**: Calculate mineral yields from ores and ice
- **From Minerals**: Calculate required ores/ice to produce specific mineral quantities

Both modes use advanced algorithms that consider:
- Structure bonuses (stations, citadels, refineries)
- System security status
- Reprocessing skills
- Structure rigs
- Implants
- Market prices for optimization
- Compression bonuses

## Getting Started

### Quick Start

1. **Select Calculation Mode**
   - Toggle between "To Minerals" and "From Minerals" at the top of the page

2. **Enter Your Input**
   - Paste ore/mineral quantities in the text input field
   - Format: `ItemName Quantity` (one per line)
   - Example:
     ```
     Veldspar 10000
     Scordite 5000
     Tritanium 20000
     ```

3. **Configure Your Setup**
   - Select structure type (station, citadel, etc.)
   - Choose system security status
   - Set reprocessing skills
   - Configure rigs and implants (optional)

4. **Click "Reprocess"**
   - View results in Basic or Advanced view
   - See mineral yields, values, and optimization suggestions

## Input Format

The calculator accepts input in a simple text format that matches EVE Online's inventory display:

```
ItemName Quantity
ItemName Quantity
```

### Examples

**Ores (To Minerals mode):**
```
Veldspar 10000
Scordite 5000
Plagioclase 3000
```

**Minerals (From Minerals mode):**
```
Tritanium 50000
Pyerite 25000
Mexallon 15000
```

**Mixed Input:**
You can paste directly from your EVE Online inventory or cargo hold - the calculator will parse the format automatically.

### Tips

- Copy directly from EVE Online inventory windows
- Supports both compressed and uncompressed ores
- Case-insensitive item names
- Automatically handles quantity formatting (commas, spaces)

## Structure Configuration

The calculator considers various factors that affect reprocessing yields:

### Structure Type

Different structures provide different base reprocessing yields:
- **Stations**: Standard NPC station yields
- **Citadels**: Improved yields with structure bonuses
- **Refineries**: Maximum yields for null-sec operations
- **Custom Structures**: User-defined structures with custom bonuses

### System Security

System security status affects reprocessing yields:
- **High-Sec (1.0-0.5)**: Standard yields
- **Low-Sec (0.4-0.1)**: Improved yields
- **Null-Sec (0.0)**: Maximum yields

### Rigs

Structure rigs provide material-specific bonuses:
- **Ore Processing Rigs**: Increase yields for specific ore types
- **Ice Processing Rigs**: Increase ice reprocessing yields
- **Gas Processing Rigs**: Increase gas cloud harvesting yields

**Note**: You cannot have multiple rigs affecting the same material type.

### Implants

Reprocessing implants provide skill bonuses:
- **MR-706**: +4% reprocessing yield
- **MR-805**: +5% reprocessing yield
- **MR-903**: +6% reprocessing yield

### Skills

The calculator uses your character's reprocessing skills:
- **Reprocessing**: Base skill (1% per level)
- **Reprocessing Efficiency**: Efficiency skill (1% per level)
- **Ore-specific skills**: Veldspar Processing, Scordite Processing, etc. (2% per level)

**For logged-in users**: Skills are automatically loaded from your character data. You can manually override skill levels if needed.

## Calculation Settings

Access advanced calculation settings via the expandable "Reprocessing Settings" panel:

### Prefer Compressed Ores

When enabled, the calculator prioritizes compressed ores over raw ores when both are available. Compressed ores provide better mineral yields per unit volume.

### Compression Bonus Multiplier

Controls how strongly the algorithm prefers compressed ores:
- **0.0**: No preference for compressed ores
- **0.25**: Standard compression bonus (recommended)
- **0.5**: Maximum preference for compressed ores

### Value Multiplier

Balances cost-effectiveness vs. mineral yield:
- **0.0**: Prioritize maximum mineral yield
- **1.0**: Balanced approach
- **2.0**: Recommended for cost optimization
- **4.0**: Maximum cost-effectiveness priority

### Waste Penalty Multiplier

Penalizes ores that produce excess minerals you don't need:
- **0.0**: No penalty for excess minerals
- **0.1**: Recommended starting point
- **0.5**: Strong penalty for excess minerals

### Sell Excess Mineral Types

When enabled, excess mineral types beyond what's needed are assumed to be sold instead of kept in inventory. This affects profit calculations.

### Exempt Ores

You can exclude specific ores from reprocessing calculations. Exempt ores are displayed as chips that can be removed individually.

## Output Views

### Basic View (To Minerals Mode)

The Basic View provides a simplified summary:
- **Total Unreprocessed Value**: Market value of input ores
- **Total Reprocessed Value**: Market value of output minerals
- **Mineral Summary**: List of minerals with quantities and values
- **Quick Actions**: Access market data and price history

### Advanced View

The Advanced View provides detailed breakdowns:
- **Per-Ore Analysis**: Detailed yield calculations for each ore type
- **Mineral Breakdown**: Complete mineral output with sources
- **Value Analysis**: Cost-benefit analysis
- **Optimization Suggestions**: Recommendations for better yields

### From Minerals Mode

When calculating from minerals, the Advanced View shows:
- **Required Ores**: Ores needed to produce target minerals
- **Alternative Combinations**: Different ore mixes that achieve the same result
- **Cost Comparison**: Price differences between options

## Market Integration

The calculator integrates with EVE Online market data:

### Market Location

Select the market location for price calculations:
- **Jita**: Primary trade hub
- **Amarr**: Secondary trade hub
- **Dodixie**: Regional hub
- **Hek**: Regional hub

### Market Listing Type

Choose the price source:
- **Buy Orders**: Prices you can sell at
- **Sell Orders**: Prices you can buy at

### Market Data Access

- Click mineral/item icons to view detailed market data
- Access price history charts
- View current market listings
- Compare prices across locations

## Advanced Features

### Auto-Recalculation

The calculator automatically recalculates when:
- Structure configuration changes
- Skills are modified
- Settings are adjusted
- Market location/listing changes

**Note**: Manual input changes require clicking "Reprocess" to recalculate, the "Reprocess" button is highlighted in yellow when there are manual changes that havent been applied.

### Saved Settings

**For logged-in users**: 
- Save your preferred settings as defaults
- Settings sync across devices
- Revert to default settings anytime

### Custom Structures

**For logged-in users**:
- Create custom structure configurations
- Save frequently used setups
- Share structures across characters

## Tips and Best Practices

1. **Use Compressed Ores**: When available, compressed ores provide better yields and are more space-efficient

2. **Optimize Skills**: Higher reprocessing skills significantly improve yields - train them to level V

3. **Choose the Right Structure**: Refineries in null-sec provide the best yields

4. **Consider Market Prices**: Use the value multiplier to balance yield vs. cost-effectiveness

5. **Exclude Unwanted Ores**: Use the exempt ores feature to exclude ores you don't want to process

6. **Compare Locations**: Check market prices at different locations to maximize profit

7. **Use Advanced View**: For detailed analysis, switch to Advanced View to see per-ore breakdowns

## Related Pages

- [Reprocessing Settings](Reprocessing%20Settings) - Detailed settings guide
- [Structure Configuration](Structure%20Configuration) - Structure setup guide
- [Market Integration](Market%20Integration) - Using market data features

---

*Last updated: Based on application version with full reprocessing calculator functionality*
