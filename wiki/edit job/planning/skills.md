# Skills Panel

The Skills Panel displays all skills required to execute the current job and compares them against the selected character's skill levels. It provides visual feedback to help you identify which skills need training and ensures you have the necessary qualifications before starting production.

## Overview

The Skills Panel provides:
- Required skills list showing all skills needed for the job
- Character skill comparison displaying current vs. required skill levels
- Visual status indicators using color coding to show skill adequacy
- Character selection awareness automatically using the assigned character from the active setup

## Panel Display

The panel shows a list of all skills required by the blueprint, with each skill displayed as a row showing:
- Skill name
- Character's current skill level
- Required skill level
- Visual status indicator

## Skill Rows

Each required skill is displayed with the following information:

### Skill Name
- Display: Full name of the skill (e.g., "Industry", "Advanced Industry")
- Source: Blueprint skill requirements data
- Position: Left side of the row

### Skill Level Display
- Format: "Current Level / Required Level"
- Current Level: The selected character's active skill level
  - Tooltip: "Selected character's current skill level"
  - Color: 
    - Green: If current level meets or exceeds required level
    - Red: If current level is below required level
- Required Level: The minimum skill level needed for the job
  - Tooltip: "Required skill level"
  - Color: Standard text color

### Visual Status Indicators

Each skill row includes visual indicators:

#### Background Color
- Green tint: Skill requirement is met (current level ≥ required level)
- Red tint: Skill requirement is not met (current level < required level)

#### Border Indicator
- Left border: 3px solid border on the left side of the row
- Green border: Skill requirement is met
- Red border: Skill requirement is not met

## Character Selection

The panel automatically determines which character's skills to display:

1. Primary Source: Uses the character assigned to the active setup
2. Fallback: If no character is assigned, uses the parent user's character
3. Dynamic Updates: Changes when you switch setups or assign different characters

### Character Skill Data

Skills are fetched from:
- ESI API: Real-time character skill data
- Caching: Skills are cached for performance
- Loading State: Shows loading indicator while fetching skill data
- Error Handling: Displays error message if skill data cannot be loaded

## Understanding Skill Requirements

### Skill Level Comparison

The panel compares:
- Current Level: What the character has trained
- Required Level: What the blueprint requires

### Status Interpretation

#### Green (Requirement Met)
- Character's skill level meets or exceeds the requirement
- Job can be executed successfully
- No training needed for this skill

#### Red (Requirement Not Met)
- Character's skill level is below the requirement
- Job cannot be executed until skill is trained
- Training required before starting production

## Use Cases

### Pre-Production Validation
1. Review all skill requirements in the panel
2. Check for any red indicators (missing skills)
3. Train required skills before starting production
4. Verify all skills show green before proceeding

### Character Assignment
1. Assign a character to a setup
2. Panel automatically updates to show that character's skills
3. Compare skill levels to requirements
4. Switch characters if needed to find one with adequate skills

### Skill Planning
1. Identify which skills need training
2. Plan skill training schedule
3. Use skill requirements to guide character development
4. Track progress as skills are trained

## Loading and Error States

### Loading State
- Displays loading indicator while fetching character skills
- Appears when:
  - Character is first selected
  - Skill data is being refreshed
  - ESI API is being queried

### Error State
- Displays error message if skill data cannot be loaded
- May occur due to:
  - ESI API connectivity issues
  - Authentication problems
  - Character data not available

### Empty State
- Panel is hidden if no setup is selected
- Returns null when no active setup exists

## Skill Requirements Source

Skills are determined by:
- Blueprint Type: Different blueprints require different skills
- Job Type: Manufacturing and reaction jobs may have different skill requirements
- Blueprint Data: Skills are defined in the blueprint skill requirements database

## Best Practices

### Before Starting Production
1. Check All Skills: Review every skill in the panel
2. Verify Green Status: Ensure all skills show green (requirements met)
3. Train Missing Skills: Train any skills showing red before starting
4. Character Selection: Choose characters with adequate skill levels

### During Planning
1. Skill Awareness: Be aware of skill requirements when planning jobs
2. Character Matching: Match jobs to characters with appropriate skills
3. Training Planning: Plan skill training for future job requirements
4. Skill Optimization: Consider training skills to higher levels for efficiency bonuses

## Related Documentation

- [Planning Stage Overview](planning) - General planning stage information
- [Setups](setups) - Configuring job setups and character assignment
- [Edit Job Overview](../edit-job) - Complete job editing guide
