import { lazy, Suspense } from "react";
import { LoadingPage } from "../loadingPage";

const LayoutSelector_EditJob_Planning = lazy(() =>
  import("./Edit Job Components/Planning/layoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Planning,
  }))
);
const LayoutSelector_EditJob_Purchasing = lazy(() =>
  import("./Edit Job Components/Purchasing/layoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Purchasing,
  }))
);
const LayoutSelector_EditJob_Building = lazy(() =>
  import("./Edit Job Components/Building/layoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Building,
  }))
);
const LayoutSelector_EditJob_Complete = lazy(() =>
  import("./Edit Job Components/Complete/LayoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Complete,
  }))
);
const LayoutSelector_EditJob_Selling = lazy(() =>
  import("./Edit Job Components/Selling/LayoutSelector").then((module) => ({
    default: module.LayoutSelector_EditJob_Selling,
  }))
);

export default function EditJobStepContentSelector(props) {
  const { state } = props;
  const status = state.activeJob?.jobStatus ?? 0;

  switch (status) {
    case 0:
      return (
        <Suspense fallback={<LoadingPage variant="simple" helperText="Loading step..." />}>
          <LayoutSelector_EditJob_Planning {...props} />
        </Suspense>
      );
    case 1:
      return (
        <Suspense fallback={<LoadingPage variant="simple" helperText="Loading step..." />}>
          <LayoutSelector_EditJob_Purchasing {...props} />
        </Suspense>
      );
    case 2:
      return (
        <Suspense fallback={<LoadingPage variant="simple" helperText="Loading step..." />}>
          <LayoutSelector_EditJob_Building {...props} />
        </Suspense>
      );
    case 3:
      return (
        <Suspense fallback={<LoadingPage variant="simple" helperText="Loading step..." />}>
          <LayoutSelector_EditJob_Complete {...props} />
        </Suspense>
      );
    case 4:
      return (
        <Suspense fallback={<LoadingPage variant="simple" helperText="Loading step..." />}>
          <LayoutSelector_EditJob_Selling {...props} />
        </Suspense>
      );
    default:
      return (
        <Suspense fallback={<LoadingPage variant="simple" helperText="Loading step..." />}>
          <LayoutSelector_EditJob_Planning {...props} />
        </Suspense>
      );
  }
}
