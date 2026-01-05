import { Box } from "@mui/material";
import { Header } from "../Components/Header";
import { Footer } from "../Components/Footer/Footer";

/**
 * DefaultPageLayout - A reusable page layout component that provides a consistent structure
 * for pages throughout the application. It includes a fixed header, a flexible content area,
 * and a footer.
 *
 * @component
 * @param {Object} props - The component props
 * @param {React.ReactNode} props.children - The main content to be rendered in the layout's content area
 * @param {Object} [props.headerProps] - Optional props to pass to the Header component
 * @param {Object} [props.footerProps] - Optional props to pass to the Footer component
 * @returns {JSX.Element} A Box component containing Header, content area, and Footer
 *
 * @example
 * ```jsx
 * <DefaultPageLayout>
 *   <Grid container>
 *     <Grid size={12}>Content here</Grid>
 *   </Grid>
 * </DefaultPageLayout>
 * ```
 */
export default function DefaultPageLayout({
  children,
  headerProps,
  footerProps,
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100vh",
      }}
    >
      <Header {...headerProps} />
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          flex: 1,
          paddingTop: { xs: 8, sm: 10 },
          paddingBottom: { xs: 1, sm: 2 },
          paddingX: { xs: 0.5, md: 1 },
          boxSizing: "border-box",
        }}
      >
        {children}
      </Box>
      <Footer {...footerProps} />
    </Box>
  );
}
