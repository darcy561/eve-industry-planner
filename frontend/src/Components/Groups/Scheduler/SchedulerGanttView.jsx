import { useMemo, useState } from "react";
import { Box, Typography, Tooltip, useTheme } from "@mui/material";
import useUsersStore from "../../../Zustand/usersStore";
import { jobTypeMapping } from "../../../Context/defaultValues";
import { formatTimeDuration } from "../../../Functions/Helper/numberParser";

/**
 * Gantt chart view for displaying scheduled tasks across characters.
 *
 * @param {Object} props
 * @param {Array} props.scheduledTasks - Array of scheduled task objects
 * @param {number} props.makespan - Total schedule duration in seconds
 * @param {Array} props.groupJobs - Array of Job objects for lookup
 */
export default function SchedulerGanttView({
    scheduledTasks = [],
    makespan = 0,
    groupJobs = [],
}) {
    const theme = useTheme();
    const [hoveredTaskId, setHoveredTaskId] = useState(null);

    // Build job lookup map
    const jobsById = useMemo(() => {
        const map = {};
        for (const job of groupJobs) {
            map[job.jobID] = job;
        }
        return map;
    }, [groupJobs]);

    // Build task lookup map for quick dependency lookup
    const tasksById = useMemo(() => {
        const map = {};
        for (const task of scheduledTasks) {
            map[task.id] = task;
        }
        return map;
    }, [scheduledTasks]);

    // Get dependency task IDs for the hovered task
    const dependencyTaskIds = useMemo(() => {
        if (!hoveredTaskId) return new Set();
        const hoveredTask = tasksById[hoveredTaskId];
        if (!hoveredTask || !hoveredTask.parentIds) return new Set();
        return new Set(hoveredTask.parentIds);
    }, [hoveredTaskId, tasksById]);

    // Group tasks by character
    const tasksByCharacter = useMemo(() => {
        const grouped = {};
        for (const task of scheduledTasks) {
            const charHash = task.characterHash;
            if (!grouped[charHash]) {
                grouped[charHash] = [];
            }
            grouped[charHash].push(task);
        }
        return grouped;
    }, [scheduledTasks]);

    // Get unique characters in order
    const characters = useMemo(() => {
        const charHashes = [...new Set(scheduledTasks.map((t) => t.characterHash))];
        return charHashes.map((hash) => {
            const user = useUsersStore
                .getState()
                .users.actions.findUserByCharacterHash(hash);
            return {
                characterHash: hash,
                characterName: user?.CharacterName || hash,
            };
        });
    }, [scheduledTasks]);

    if (makespan === 0 || scheduledTasks.length === 0) {
        return (
            <Box sx={{ p: 2, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    No scheduled tasks to display
                </Typography>
            </Box>
        );
    }

    const rowHeight = 40;
    const headerHeight = 40;
    const characterNameWidth = 150;
    // Base logical width of the timeline; container can scroll horizontally
    const chartWidth = 1600;

    return (
        <Box
            sx={{
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                maxHeight: "100%",
                overflow: "auto",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                position: "relative",
            }}
        >
            {/* Vertical timestamp lines spanning full height */}
            <Box
                sx={{
                    position: "absolute",
                    top: 0,
                    left: characterNameWidth,
                    width: chartWidth,
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 1,
                }}
            >
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const leftPercent = ratio * 100;
                    const isLastMarker = ratio === 1;
                    return (
                        <Box
                            key={ratio}
                            sx={{
                                position: "absolute",
                                left: `${leftPercent}%`,
                                top: 0,
                                bottom: 0,
                                ...(isLastMarker ? {
                                    borderRight: "1px solid",
                                    borderColor: "divider",
                                } : {
                                    borderLeft: "1px solid",
                                    borderColor: "divider",
                                }),
                                transform: isLastMarker ? "translateX(-100%)" : "none",
                            }}
                        />
                    );
                })}
            </Box>

            {/* Header */}
            <Box
                sx={{
                    display: "flex",
                    height: headerHeight,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    position: "sticky",
                    top: 0,
                    zIndex: 3,
                    minWidth: characterNameWidth + chartWidth,
                    bgcolor: "background.paper",
                }}
            >
                <Box
                    sx={{
                        width: characterNameWidth,
                        display: "flex",
                        alignItems: "center",
                        px: 2,
                        borderRight: "1px solid",
                        borderColor: "divider",
                        position: "sticky",
                        left: 0,
                        zIndex: 4,
                        flexShrink: 0,
                        bgcolor: "background.paper",
                    }}
                >
                    <Typography variant="body2" fontWeight="bold">
                        Character
                    </Typography>
                </Box>
                <Box
                    sx={{
                        position: "relative",
                        width: chartWidth,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    {/* Time axis */}
                    <Box
                        sx={{
                            flex: 1,
                            position: "relative",
                            width: "100%",
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        {/* Time markers */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                            const time = makespan * ratio;
                            const leftPercent = ratio * 100;
                            const isLastMarker = ratio === 1;
                            return (
                                <Box
                                    key={ratio}
                                    sx={{
                                        position: "absolute",
                                        left: `${leftPercent}%`,
                                        top: 0,
                                        bottom: 0,
                                        borderLeft: "1px solid",
                                        borderColor: "divider",
                                        display: "flex",
                                        alignItems: "center",
                                        pl: 0.5,
                                        transform: isLastMarker ? "translateX(-100%)" : "none",
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary">
                                        {formatTimeDuration(time, { days: true, hours: true, minutes: false, seconds: false })}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            </Box>

            {/* Character rows */}
            <Box>
                {characters.map((char) => {
                    const charTasks = tasksByCharacter[char.characterHash] || [];

                    // Group this character's tasks by slot index
                    const slotsMap = charTasks.reduce((acc, task) => {
                        const idx = task.slotIndex ?? 0;
                        if (!acc[idx]) acc[idx] = [];
                        acc[idx].push(task);
                        return acc;
                    }, {});

                    const slotIndices = Object.keys(slotsMap)
                        .map((k) => Number(k))
                        .sort((a, b) => a - b);

                    return (
                        <Box key={char.characterHash}>
                            {/* Character name header row */}
                            <Box
                                sx={{
                                    display: "flex",
                                    height: rowHeight,
                                    borderBottom: "1px solid",
                                    borderColor: "divider",
                                    minWidth: characterNameWidth + chartWidth,
                                }}
                            >
                                {/* Character name */}
                                <Box
                                    sx={{
                                        width: characterNameWidth,
                                        display: "flex",
                                        alignItems: "center",
                                        px: 2,
                                        borderRight: "1px solid",
                                        borderColor: "divider",
                                        position: "sticky",
                                        left: 0,
                                        zIndex: 2,
                                        bgcolor: "background.paper",
                                    }}
                                >
                                    <Typography variant="body2" fontWeight="bold">
                                        {char.characterName}
                                    </Typography>
                                </Box>
                                {/* Empty space for alignment */}
                                <Box
                                    sx={{
                                        position: "relative",
                                        width: chartWidth,
                                    }}
                                />
                            </Box>

                            {/* Per-slot rows for this character */}
                            {slotIndices.map((slotIndex) => {
                                const slotTasks = slotsMap[slotIndex] || [];
                                return (
                                    <Box
                                        key={`${char.characterHash}-slot-${slotIndex}`}
                                        sx={{
                                            display: "flex",
                                            height: rowHeight,
                                            borderBottom: "1px solid",
                                            borderColor: "divider",
                                            minWidth: characterNameWidth + chartWidth,
                                        }}
                                    >
                                        {/* Slot label */}
                                        <Box
                                            sx={{
                                                width: characterNameWidth,
                                                display: "flex",
                                                alignItems: "center",
                                                px: 2,
                                                borderRight: "1px solid",
                                                borderColor: "divider",
                                                position: "sticky",
                                                left: 0,
                                                zIndex: 2,
                                                bgcolor: "background.paper",
                                            }}
                                        >
                                            <Typography variant="caption" color="text.secondary">
                                                Slot {slotIndex + 1}
                                            </Typography>
                                        </Box>

                                        {/* Tasks for this specific slot (per-slot row) */}
                                        <Box
                                            sx={{
                                                position: "relative",
                                                width: chartWidth,
                                            }}
                                        >
                                            {([...slotTasks]
                                                .sort(
                                                    (a, b) =>
                                                        a.startTime - b.startTime ||
                                                        a.endTime - b.endTime ||
                                                        a.id.localeCompare(b.id)
                                                )).map((task, index) => {
                                                    const job = jobsById[task.jobID];
                                                    const jobTypeKey =
                                                        job && jobTypeMapping[job.jobType]
                                                            ? jobTypeMapping[job.jobType]
                                                            : null;
                                                    const left = (task.startTime / makespan) * 100;
                                                    const width =
                                                        ((task.endTime - task.startTime) / makespan) * 100;
                                                    const color =
                                                        (jobTypeKey &&
                                                            theme.palette?.[jobTypeKey]?.main) ||
                                                        theme.palette.grey[500];

                                                    // Slight vertical offset within the slot row to distinguish overlaps
                                                    const bands = 3;
                                                    const bandIndex = index % bands;
                                                    const offsetPx = (bandIndex - (bands - 1) / 2) * 4;

                                                    const tooltipContent = (
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="bold">
                                                                {job?.name || task.jobID}
                                                            </Typography>
                                                            <Typography variant="caption">
                                                                {jobTypeKey
                                                                    ? jobTypeKey.charAt(0).toUpperCase() +
                                                                    jobTypeKey.slice(1)
                                                                    : task.activityType}
                                                            </Typography>
                                                            <Typography variant="caption" display="block">
                                                                Start: {formatTimeDuration(task.startTime, { days: true, hours: true, minutes: false, seconds: false })}
                                                            </Typography>
                                                            <Typography variant="caption" display="block">
                                                                End: {formatTimeDuration(task.endTime, { days: true, hours: true, minutes: false, seconds: false })}
                                                            </Typography>
                                                            <Typography variant="caption" display="block">
                                                                Duration:{" "}
                                                                {formatTimeDuration(task.endTime - task.startTime, { days: true, hours: true, minutes: true, seconds: true })}
                                                            </Typography>
                                                        </Box>
                                                    );

                                                    const isHovered = hoveredTaskId === task.id;
                                                    const isDependency = dependencyTaskIds.has(task.id);

                                                    return (
                                                        <Tooltip key={task.id} title={tooltipContent} arrow>
                                                            <Box
                                                                onMouseEnter={() => setHoveredTaskId(task.id)}
                                                                onMouseLeave={() => setHoveredTaskId(null)}
                                                                sx={{
                                                                    position: "absolute",
                                                                    left: `${left}%`,
                                                                    width: `${width}%`,
                                                                    top: `calc(50% + ${offsetPx}px)`,
                                                                    transform: "translateY(-50%)",
                                                                    height: "60%",
                                                                    bgcolor: color,
                                                                    borderRadius: 0.5,
                                                                    border: "1px solid",
                                                                    borderColor: isHovered
                                                                        ? theme.palette.primary.main
                                                                        : isDependency
                                                                            ? theme.palette.warning.main
                                                                            : "rgba(0,0,0,0.1)",
                                                                    borderWidth: isHovered || isDependency ? 2 : 1,
                                                                    cursor: "pointer",
                                                                    opacity: isHovered ? 1 : isDependency ? 0.9 : 1,
                                                                    boxShadow: isHovered
                                                                        ? `0 0 8px ${theme.palette.primary.main}`
                                                                        : isDependency
                                                                            ? `0 0 6px ${theme.palette.warning.main}`
                                                                            : "none",
                                                                    zIndex: isHovered ? 10 : isDependency ? 5 : 1,
                                                                    transition: "all 0.2s ease",
                                                                }}
                                                            />
                                                        </Tooltip>
                                                    );
                                                })}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}

