import { Box, Typography } from "@mui/material";
import { alpha, keyframes } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";

export const LOGO_SRC = "/android-chrome-192x192.png";

const logoPulse = keyframes`
  0%, 100% {
    transform: scale(1) rotate(0deg);
  }
  50% {
    transform: scale(1.06) rotate(1.5deg);
  }
`;

const glowPulse = keyframes`
  0%, 100% {
    opacity: 0.35;
    transform: scale(1);
  }
  50% {
    opacity: 0.65;
    transform: scale(1.08);
  }
`;

const dotBounce = keyframes`
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-7px);
    opacity: 1;
  }
`;

const DENSITY = {
  route: { logo: 112, glowMin: 200 },
  page: { logo: 96, glowMin: 180 },
  embedded: { logo: 88, glowMin: 176 },
};

/**
 * Radial backdrop + primary tint — matches across route transition and in-app page loads.
 */
export function LoadingBrandBackdrop({ children, sx }) {
  return (
    <Box
      sx={{
        position: "relative",
        isolation: "isolate",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 4,
        overflow: "hidden",
        background: (t) =>
          t.palette.mode === "dark"
            ? `radial-gradient(ellipse 80% 60% at 50% 35%, ${alpha(
                t.palette.primary.main,
                0.14
              )} 0%, transparent 55%), ${t.palette.background.default}`
            : `radial-gradient(ellipse 80% 60% at 50% 35%, ${alpha(
                t.palette.primary.main,
                0.1
              )} 0%, transparent 55%), ${t.palette.background.default}`,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Logo, glow, optional caption, bouncing dots — shared by LoadingPage and edit-job loaders.
 *
 * @param {'route' | 'page' | 'embedded'} density
 */
export function LoadingBrandScene({
  density = "page",
  caption = "Loading…",
  showDots = true,
}) {
  const theme = useTheme();
  const { logo: logoSize, glowMin } = DENSITY[density] ?? DENSITY.page;

  return (
    <>
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          left: "50%",
          top: "38%",
          transform: "translate(-50%, -50%)",
          width: Math.max(logoSize * 2.2, glowMin),
          height: Math.max(logoSize * 2.2, glowMin),
          borderRadius: "50%",
          background: `radial-gradient(circle, ${alpha(
            theme.palette.primary.main,
            0.22
          )} 0%, transparent 70%)`,
          animation: `${glowPulse} 2.8s ease-in-out infinite`,
          pointerEvents: "none",
        }}
      />

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2.5,
        }}
      >
        <Box
          component="img"
          src={LOGO_SRC}
          alt=""
          width={logoSize}
          height={logoSize}
          sx={{
            display: "block",
            borderRadius: 2,
            boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.22)}`,
            animation: `${logoPulse} 2.2s ease-in-out infinite`,
            userSelect: "none",
          }}
        />
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            letterSpacing: 0.6,
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          {caption}
        </Typography>
        {showDots && (
          <Box
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                aria-hidden
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  animation: `${dotBounce} 1s ease-in-out infinite`,
                  animationDelay: `${i * 0.14}s`,
                }}
              />
            ))}
          </Box>
        )}
      </Box>
    </>
  );
}
