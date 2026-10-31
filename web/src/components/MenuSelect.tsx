import { useId, useState, type ReactNode } from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { IconCheck, IconChevron } from "./icons";

export interface MenuOption {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * A select-style dropdown built on MUI Menu (https://mui.com/material-ui/react-menu/).
 * MUI handles focus, arrow keys, type-to-jump, Escape, and click-away; the selected
 * item gets focus when the menu opens ("selectedMenu" variant).
 */
export function MenuSelect({
  options,
  value,
  onChange,
  labelId,
  ariaLabel,
  size = "lg",
  placeholder = "Choose…",
}: {
  options: MenuOption[];
  value: string;
  onChange: (id: string) => void;
  labelId?: string;
  ariaLabel?: string;
  size?: "lg" | "sm";
  placeholder?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const buttonId = useId();
  const menuId = useId();
  const selected = options.find((o) => o.id === value);

  return (
    <div className={`menu-select ${size} ${open ? "open" : ""}`}>
      <button
        type="button"
        id={buttonId}
        className="ms-trigger"
        aria-haspopup="listbox"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-labelledby={labelId ? `${labelId} ${buttonId}` : undefined}
        aria-label={labelId ? undefined : ariaLabel}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {selected?.icon && <span className="ms-icon">{selected.icon}</span>}
        <span className="ms-text">{selected?.label ?? placeholder}</span>
        <span className="ms-chevron">
          <IconChevron size={size === "sm" ? 14 : 16} />
        </span>
      </button>

      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        variant="selectedMenu"
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: { sx: { width: size === "lg" ? anchor?.clientWidth : undefined, minWidth: size === "sm" ? 200 : undefined } },
          list: { role: "listbox", "aria-labelledby": labelId ?? buttonId },
        }}
      >
        {options.map((o) => {
          const isSelected = o.id === value;
          return (
            <MenuItem
              key={o.id}
              role="option"
              selected={isSelected}
              disabled={o.disabled}
              aria-selected={isSelected}
              onClick={() => {
                onChange(o.id);
                setAnchor(null);
              }}
              sx={size === "lg" ? { py: 1, alignItems: "center" } : undefined}
            >
              {o.icon && (
                <ListItemIcon>
                  <span className={`ms-icon ${isSelected ? "on" : ""}`}>{o.icon}</span>
                </ListItemIcon>
              )}
              <ListItemText primary={o.label} secondary={o.description} />
              {isSelected && (
                <span className="ms-tick" aria-hidden="true">
                  <IconCheck size={18} />
                </span>
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </div>
  );
}
