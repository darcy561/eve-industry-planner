import { useEffect, useState } from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import useEditJobReducer from "../Components/Edit Job/Edit Job Hooks/useEditJobReducer";
import Job from "../Classes/job";
import seedLocationNames from "./seedLocationNames";
import { testQueryClient } from "./queryClients.js";

/* The app paints job types from palette entries of its own, which panels read
 * straight off the theme. A bare theme has none of them and the panel throws. */
const theme = createTheme({
  palette: {
    manufacturing: { main: "#f9a825" },
    reaction: { main: "#8e24aa" },
    invention: { main: "#1e88e5" },
    reprocessing: { main: "#43a047" },
  },
});

/**
 * Mounts a piece of the Edit Job page over the real reducer, so a test can press
 * what a reader presses and then read the job that came out of it.
 *
 * Nothing here is mocked: the control dispatches a real action, the real reducer
 * builds a real `Job`, and `editJob.current` is that job. That is the join these
 * tests exist to cover — a control and a reducer can each be right on their own
 * and still disagree about what an action means.
 *
 * @param {Object} props
 * @param {Object} props.job - Job fields to start from, as stored.
 * @param {(props: {state: Object, actions: Object}) => React.ReactNode} props.children
 * @param {{current: Object}} props.editJobRef - Filled in with the live reducer state.
 * @param {Object<string, string|Object>} [props.locationNames] - Names the panels should find
 *   already resolved, seeded into the cache the real hook reads.
 */
export function EditJobHarness({ job, children, editJobRef, locationNames }) {
  const [queryClient] = useState(() => {
    const client = testQueryClient();
    if (locationNames) seedLocationNames(client, locationNames);
    return client;
  });
  const { state, actions } = useEditJobReducer();

  useEffect(() => {
    actions.setActiveJob(new Job(job));
    // Seeded once, from the job this harness was given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Handing the current state out to the test is exactly what an effect is for:
   * telling something outside React what React now holds. */
  useEffect(() => {
    editJobRef.current = state;
  });

  if (!state.activeJob) return null;

  /* The page sits inside the app's theme and query client, and the panels under
   * it read both. */
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        {children({ state, actions })}
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * @param {Object} job - Job fields to start from, as stored.
 * @param {(props: {state: Object, actions: Object}) => React.ReactNode} children
 * @param {{locationNames?: Object<string, string|Object>}} [options]
 * @returns {{editJob: {current: Object}, ...import("@testing-library/react").RenderResult}}
 */
export function renderOverEditJob(job, children, { locationNames } = {}) {
  const editJob = { current: null };
  const result = render(
    <EditJobHarness
      job={job}
      editJobRef={editJob}
      locationNames={locationNames}
    >
      {children}
    </EditJobHarness>,
  );
  return { ...result, editJob };
}

/** A job as the planner stores one, with only what a test cares about set. */
export function storedJob(overrides = {}) {
  return {
    jobID: "job-1",
    name: "Rifter",
    itemID: 587,
    jobType: 1,
    jobStatus: 0,
    itemsProducedPerRun: 1,
    build: {
      setup: {},
      materials: [],
      childJobs: {},
    },
    ...overrides,
  };
}
