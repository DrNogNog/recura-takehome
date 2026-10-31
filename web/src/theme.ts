import { createTheme } from "@mui/material/styles";

/**
 * MUI theme in the Recura palette (pumpkin blush, brown, quiet gray).
 * colorSchemeSelector "media" follows the OS light/dark setting, like styles.css does.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "media" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#b5592f", contrastText: "#ffffff" },
        secondary: { main: "#6e4a35" },
        background: { default: "#eeebe7", paper: "#fffdfb" },
        text: { primary: "#3b2a20", secondary: "#7d736c" },
        divider: "#e3ddd7",
        action: { hover: "#f6f2ee", selected: "rgba(232, 135, 92, 0.16)" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#f0956a", contrastText: "#2a160c" },
        secondary: { main: "#d8b294" },
        background: { default: "#1a1613", paper: "#241e1a" },
        text: { primary: "#f1e9e2", secondary: "#ada29a" },
        divider: "#3a302a",
        action: { hover: "#2e2621", selected: "rgba(240, 149, 106, 0.18)" },
      },
    },
  },
  typography: { fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  shape: { borderRadius: 12 },
  components: {
    MuiMenu: {
      defaultProps: { transitionDuration: 160 },
      styleOverrides: {
        paper: ({ theme }) => ({
          marginTop: 8,
          borderRadius: 18,
          border: `1px solid ${theme.vars.palette.divider}`,
          boxShadow: "0 24px 60px -20px rgb(59 42 32 / 0.35)",
          backgroundImage: "none",
        }),
        list: { padding: 6, display: "grid", gap: 4 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 12,
          minHeight: 44,
          gap: 12,
          fontWeight: 600,
          fontSize: "0.92rem",
          "&.Mui-selected, &.Mui-selected:hover, &.Mui-selected.Mui-focusVisible": {
            backgroundColor: theme.vars.palette.action.selected,
          },
          "&.Mui-focusVisible": { outline: `2px solid ${theme.vars.palette.primary.main}`, outlineOffset: -2 },
        }),
      },
    },
    MuiListItemIcon: { styleOverrides: { root: { minWidth: 0, "&&": { minWidth: 0 } } } },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontWeight: 700, fontSize: "0.95rem" },
        secondary: { fontSize: "0.8rem", lineHeight: 1.35, whiteSpace: "normal" },
      },
    },
    MuiDivider: { styleOverrides: { root: { margin: "2px 6px" } } },
  },
});
