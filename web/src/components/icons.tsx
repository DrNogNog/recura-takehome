// Workflow icons supplied as images, served from web/public/icons under their original filenames.
export type IconFile = "appointment.png" | "food_icon.png" | "restock.png" | "about us.png" | "trust_by_design.png";
export const ImageIcon = ({ file, size = 24 }: { file: IconFile; size?: number }) => (
  <img className="image-icon" src={`/icons/${encodeURIComponent(file)}`} alt="" width={size} height={size} />
);

// Small inline icon set (Lucide-style strokes) so the UI needs no icon dependency.
type P = { size?: number };
const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconUser = ({ size = 18 }: P) => svg(size, <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconLock = ({ size = 18 }: P) => svg(size, <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const IconCalendar = ({ size = 18 }: P) => svg(size, <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>);
export const IconCheck = ({ size = 18 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>);
export const IconClock = ({ size = 18 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconBox = ({ size = 18 }: P) => svg(size, <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>);
export const IconLeaf = ({ size = 18 }: P) => svg(size, <><path d="M11 20A7 7 0 0 1 4 13c0-6 7-9 16-9 0 9-3 16-9 16Z" /><path d="M4 20c4-4 7-6 11-8" /></>);
export const IconChart = ({ size = 18 }: P) => svg(size, <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>);
export const IconHeart = ({ size = 22 }: P) => svg(size, <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />);
export const IconKey = ({ size = 22 }: P) => svg(size, <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2" /></>);
export const IconArrow = ({ size = 18 }: P) => svg(size, <path d="M5 12h14M13 6l6 6-6 6" />);
export const IconChevron = ({ size = 16 }: P) => svg(size, <path d="m6 9 6 6 6-6" />);
export const IconLogout = ({ size = 18 }: P) => svg(size, <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>);
export const IconSwap = ({ size = 18 }: P) => svg(size, <><path d="M7 4 3 8l4 4" /><path d="M3 8h14M17 20l4-4-4-4" /><path d="M21 16H7" /></>);
export const IconHome = ({ size = 18 }: P) => svg(size, <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></>);
export const IconSparkle = ({ size = 18 }: P) => svg(size, <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />);
export const IconShield = ({ size = 18 }: P) => svg(size, <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>);
export const IconPhone = ({ size = 18 }: P) => svg(size, <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>);
export const IconGrid = ({ size = 18 }: P) => svg(size, <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const IconExpand = ({ size = 18 }: P) => svg(size, <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />);
export const IconX = ({ size = 18 }: P) => svg(size, <path d="M18 6 6 18M6 6l12 12" />);
export const IconMenu = ({ size = 18 }: P) => svg(size, <path d="M4 7h16M4 12h16M4 17h16" />);
export const IconPlay = ({ size = 16 }: P) => svg(size, <path d="M7 4v16l13-8z" />);
