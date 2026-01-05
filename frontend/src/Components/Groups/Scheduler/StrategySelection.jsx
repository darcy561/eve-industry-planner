import { Box, Typography, FormControl, FormLabel, RadioGroup, FormControlLabel, Radio } from "@mui/material";
import { SchedulingStrategy } from "../../../Functions/Scheduler/groupSchedulerCore";

/**
 * Strategy selection component for the scheduler.
 * Allows users to select which scheduling strategy to use.
 * 
 * @param {Object} props
 * @param {number} props.value - Current strategy value (from SchedulingStrategy enum)
 * @param {Function} props.onChange - Callback when strategy changes, receives strategy value
 * @returns {JSX.Element}
 */
export default function StrategySelection({ 
    value,
    onChange 
}) {
    const handleChange = (event) => {
        const newValue = parseInt(event.target.value, 10);
        if (onChange) {
            onChange(newValue);
        }
    };

    return (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
            <FormControl component="fieldset">
                <FormLabel component="legend">
                    <Typography variant="subtitle2">
                        Scheduling Strategy
                    </Typography>
                </FormLabel>
                <RadioGroup
                    row
                    value={value.toString()}
                    onChange={handleChange}
                >
                    <FormControlLabel
                        value={SchedulingStrategy.GREEDY.toString()}
                        control={<Radio size="small" />}
                        label="Greedy"
                    />
                    {/* <FormControlLabel
                        value={SchedulingStrategy.PACKED.toString()}
                        control={<Radio size="small" />}
                        label="Packed"
                    /> */}
                </RadioGroup>
            </FormControl>
        </Box>
    );
}

