import { useState, useCallback } from "react";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { Box, Typography } from "@mui/material";
import { useGroupScheduler } from "./Hooks/useGroupScheduler";
import SchedulerGanttView from "./SchedulerGanttView";
import CharacterSelection from "./CharacterSelection";
import StrategySelection from "./StrategySelection";
import { SchedulingStrategy } from "../../../Functions/Scheduler/groupSchedulerCore";

export default function GroupSchedulerFrame({
    groupJobs = []
}) {
    const [selectedCharacterRows, setSelectedCharacterRows] = useState([]);
    const [schedulingStrategy, setSchedulingStrategy] = useState(SchedulingStrategy.GREEDY);

    const { schedule, isLoading, isError, error } = useGroupScheduler(
        groupJobs,
        schedulingStrategy,
        selectedCharacterRows
    );

    const handleSelectionChange = useCallback((rows) => {
        setSelectedCharacterRows(rows);
    }, []);

    const handleStrategyChange = useCallback((strategy) => {
        setSchedulingStrategy(strategy);
    }, []);

    console.log(schedule);
    return (
        <ContentPanel
        title="Scheduler"
            componentName="Group Scheduler Frame"
            paperSx={{ padding: 0, overflow: "hidden" }}
            isLoading={isLoading}
            isError={isError}
            error={error}
        >
            <Box sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
                {schedule && (
                    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                        <Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                                <Typography variant="body2">
                                    Total scheduled tasks: {schedule.tasks.length}
                                </Typography>
                                {schedule.unscheduledTaskIds.length > 0 && (
                                    <Typography variant="body2" sx={{
                                        color: "warning.main"
                                    }}>
                                        Unscheduled tasks: {schedule.unscheduledTaskIds.length}
                                    </Typography>
                                )}
                                <Typography variant="body2">
                                    Total Duration: {(() => {
                                        const totalSeconds = schedule.makespan;
                                        const days = Math.floor(totalSeconds / 86400);
                                        const hours = Math.floor((totalSeconds % 86400) / 3600);
                                        
                                        if (days > 0 && hours > 0) {
                                            return `${days}d ${hours}h`;
                                        } else if (days > 0) {
                                            return `${days}d`;
                                        } else {
                                            return `${hours}h`;
                                        }
                                    })()}
                                </Typography>
                            </Box>
                            {schedule.unscheduledTaskIds.length > 0 && schedule.unscheduledTaskReasons && (
                                <Box sx={{ mt: 1 }}>
                                    {schedule.unscheduledTaskIds.map((taskId) => {
                                        const reason = schedule.unscheduledTaskReasons[taskId] || "Unknown reason";
                                        return (
                                            <Typography
                                                key={taskId}
                                                variant="caption"
                                                sx={{
                                                    color: "error.main",
                                                    display: "block"
                                                }}>
                                                {reason}
                                            </Typography>
                                        );
                                    })}
                                </Box>
                            )}
                        </Box>
                        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                            <SchedulerGanttView
                                scheduledTasks={schedule.tasks}
                                makespan={schedule.makespan}
                                groupJobs={groupJobs}
                            />
                        </Box>
                        <StrategySelection
                            value={schedulingStrategy}
                            onChange={handleStrategyChange}
                        />
                        <CharacterSelection
                            onSelectionChange={handleSelectionChange}
                        />
                    </Box>
                )}
            </Box>
        </ContentPanel>
    );
}

