import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import { IconExpand, IconX } from "./icons";

// Photos supplied for the home page, served from web/public/images under their original filenames.
export type PhotoFile = "Patient-appointment-coordination.jpeg" | "food rec.jpg" | "medical supplies.png";

const ALT: Record<PhotoFile, string> = {
  "Patient-appointment-coordination.jpeg": "A doctor smiling and talking with a patient in an exam room",
  "food rec.jpg": "Food pyramids showing what to eat daily, weekly, and rarely, with and without fish and meat",
  "medical supplies.png": "Medical supplies laid out: stethoscope, gloves, scissors, thermometer, blood pressure cuff, and medication",
};

const src = (file: PhotoFile) => `/images/${encodeURIComponent(file)}`;

/** A small photo thumbnail button; clicking it opens the full image in a dialog. */
export function PhotoThumb({ file, className = "" }: { file: PhotoFile; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`photo-thumb ${className}`} onClick={() => setOpen(true)} aria-label={`Expand photo: ${ALT[file]}`}>
        <img src={src(file)} alt="" loading="lazy" />
        <span className="photo-expand" aria-hidden="true">
          <IconExpand size={12} />
        </span>
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="lg"
        aria-label={ALT[file]}
        slotProps={{ paper: { sx: { borderRadius: "20px", overflow: "hidden", m: 2, backgroundImage: "none" } } }}
      >
        <figure className="lightbox">
          <img src={src(file)} alt={ALT[file]} />
          <figcaption>{ALT[file]}</figcaption>
          <button type="button" className="lightbox-close" onClick={() => setOpen(false)} aria-label="Close photo">
            <IconX />
          </button>
        </figure>
      </Dialog>
    </>
  );
}
