import type { ReactNode } from "react";
import Dialog from "@mui/material/Dialog";
import { IconX } from "./icons";

/** App-wide dialog (MUI Dialog) with a title bar and close button. */
export function AppDialog({
  title,
  onClose,
  children,
  maxWidth = "sm",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: "xs" | "sm" | "md";
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth
      aria-labelledby="app-dialog-title"
      slotProps={{ paper: { sx: { borderRadius: "20px", backgroundImage: "none" } } }}
    >
      <div className="app-dialog">
        <header className="modal-head">
          <h2 id="app-dialog-title">{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </header>
        {children}
      </div>
    </Dialog>
  );
}
