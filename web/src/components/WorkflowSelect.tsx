import type { ReactNode } from "react";
import { MenuSelect } from "./MenuSelect";
import { IconBolt, IconCheck, ImageIcon } from "./icons";

export interface WorkflowOption {
  id: string;
  label: string;
  description: string;
}

const ICONS: Record<string, ReactNode> = {
  appointment: <ImageIcon file="appointment.png" />,
  checkin: <ImageIcon file="appointment.png" />,
  reschedule: <ImageIcon file="appointment.png" />,
  calculator: <ImageIcon file="appointment.png" />,
  restock: <ImageIcon file="restock.png" />,
  food: <ImageIcon file="food_icon.png" />,
  automations: <span className="bolt-icon"><IconBolt /></span>,
};

export const workflowIcon = (id: string, size?: number): ReactNode => {
  if (id === "automations") return <span className="bolt-icon"><IconBolt size={size ? Math.round(size * 0.8) : 18} /></span>;
  const file = id === "restock" ? "restock.png" : id === "food" ? "food_icon.png" : ICONS[id] ? "appointment.png" : null;
  return file ? <ImageIcon file={file} size={size} /> : <IconCheck />;
};

/** The workflow picker: an MUI Menu with an icon, title, and description per workflow. */
export function WorkflowSelect({
  options,
  value,
  onChange,
  labelId,
}: {
  options: WorkflowOption[];
  value: string;
  onChange: (id: string) => void;
  labelId: string;
}) {
  return (
    <MenuSelect
      labelId={labelId}
      value={value}
      onChange={onChange}
      placeholder="Choose a workflow"
      options={options.map((o) => ({ ...o, icon: ICONS[o.id] ?? <IconCheck /> }))}
    />
  );
}
