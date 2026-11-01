import { useCallback, useEffect, useId, useState } from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import { api, navigate, type User } from "./api";
import { BrandLogo } from "./Login";
import { ErrorBoundary, ErrorNote, IconChart, IconClock, IconGrid, IconHome, IconLogout, IconMenu, IconPlay, LoadingScreen, Spinner, workflowIcon, WorkflowSelect } from "./components";
import { DemoAdminWorkflow } from "./workflows/Admin";
import { HistoryWorkflow } from "./workflows/automations/History";
import { AutomationPopups } from "./workflows/automations/Popups";

/** Demo admin page: opened from the patient hamburger menu (not part of the workflow dropdown). */
const DEMO_ADMIN = {
  id: "admin",
  label: "Demo admin",
  description: "Set and switch patient times, and see every patient's schedule on a Gantt chart.",
};

/** Automation history report: opened from the hamburger menu in both portals. */
const HISTORY = {
  id: "history",
  label: "Automation history",
  description: "A report of every automation that has run: what triggered it, each step's result, and who got pop-ups.",
};

/** Pages opened from the hamburger menu rather than the workflow dropdown. */
const MENU_PAGES = [HISTORY, DEMO_ADMIN];
const menuPageIcon = (id: string, size?: number) => (id === HISTORY.id ? <IconClock size={size} /> : <IconChart size={size} />);
import { AppointmentWorkflow, CalculatorWorkflow, CheckInWorkflow, RescheduleWorkflow } from "./workflows/Appointment";
import { RestockWorkflow } from "./workflows/Restock";
import { FoodWorkflow } from "./workflows/Food";
import { AutomationsWorkflow } from "./workflows/automations";

type WorkflowView = (props: { onReady: () => void }) => React.ReactNode;

// Each kind of account only gets its own workflow screens.
const VIEWS: Record<User["portal"], Record<string, WorkflowView>> = {
  patient: {
    appointment: AppointmentWorkflow,
    checkin: CheckInWorkflow,
    reschedule: RescheduleWorkflow,
    calculator: CalculatorWorkflow,
    automations: AutomationsWorkflow,
    history: HistoryWorkflow, // opened from the hamburger menu, not the dropdown
    admin: DemoAdminWorkflow, // opened from the hamburger menu, not the dropdown
  },
  staff: {
    restock: RestockWorkflow,
    food: FoodWorkflow,
    automations: AutomationsWorkflow,
    history: HistoryWorkflow, // opened from the hamburger menu
  },
};

interface Workflow {
  id: string;
  label: string;
  description: string;
}

const ROLE_LABEL: Record<User["role"], string> = { patient: "Patient", doctor: "Doctor", manager: "Manager", boss: "Boss" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** "Dr. Morgan Lee" -> "Dr. Lee", "Alex Rivera" -> "Alex". */
const shortName = (name: string) => (name.startsWith("Dr.") ? `Dr. ${name.split(" ").at(-1)}` : name.split(" ")[0]);

/** The blue user icon, cropped to its circle (the source image has a white square around it). */
function UserAvatar({ size }: { size?: "lg" }) {
  return (
    <span className={`avatar ${size ?? ""}`} aria-hidden="true">
      <img src="/user-avatar.avif" alt="" width={740} height={740} />
    </span>
  );
}

/** Three-bar + avatar button that opens an MUI Menu. */
function AccountMenu({
  user,
  onLogout,
  workflows,
  running,
  onChooseWorkflow,
  onOpenWorkflow,
}: {
  user: User;
  onLogout: () => void;
  workflows: Workflow[] | null;
  running: string | null;
  onChooseWorkflow: () => void;
  onOpenWorkflow: (id: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const menuId = useId();
  const close = () => setAnchor(null);

  return (
    <div className="account">
      <button
        className="account-btn"
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <IconMenu />
        <UserAvatar />
      </button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 270 } } }}
      >
        <li className="menu-head" role="none">
          <UserAvatar size="lg" />
          <div>
            <strong>{user.name}</strong>
            <div className="muted small">
              {ROLE_LABEL[user.role]} · Welcome
            </div>
          </div>
        </li>
        <MenuItem
          selected={!running}
          onClick={() => {
            close();
            onChooseWorkflow();
          }}
        >
          <ListItemIcon>
            <IconGrid />
          </ListItemIcon>
          Choose a workflow
        </MenuItem>
        {workflows?.map((w) => (
          <MenuItem
            key={w.id}
            selected={running === w.id}
            sx={{ pl: 2.5, fontWeight: 500 }}
            onClick={() => {
              close();
              onOpenWorkflow(w.id);
            }}
          >
            <ListItemIcon>
              <span className="menu-wf-icon">{workflowIcon(w.id, 18)}</span>
            </ListItemIcon>
            {w.label}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          selected={running === HISTORY.id}
          onClick={() => {
            close();
            onOpenWorkflow(HISTORY.id);
          }}
        >
          <ListItemIcon>
            <IconClock />
          </ListItemIcon>
          History
        </MenuItem>
        {user.portal === "patient" && (
          <MenuItem
            selected={running === DEMO_ADMIN.id}
            onClick={() => {
              close();
              onOpenWorkflow(DEMO_ADMIN.id);
            }}
          >
            <ListItemIcon>
              <IconChart />
            </ListItemIcon>
            {DEMO_ADMIN.label}
            <span className="menu-badge">Demo</span>
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            close();
            navigate("/");
          }}
        >
          <ListItemIcon>
            <IconHome />
          </ListItemIcon>
          Home screen
        </MenuItem>
        <Divider />
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            close();
            onLogout();
          }}
        >
          <ListItemIcon sx={{ color: "inherit" }}>
            <IconLogout />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </div>
  );
}

/** The running workflow lives in the URL (/login?run=food) so browser Back returns to the picker. */
const runFromUrl = () => new URLSearchParams(window.location.search).get("run");

export function Portal({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState<string | null>(runFromUrl);
  const [loading, setLoading] = useState(() => Boolean(runFromUrl()));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Workflow[]>("/api/workflows")
      .then((w) => {
        setWorkflows(w);
        // "Sign Up" on the home screen can preselect a workflow (?workflow=food).
        const wanted = new URLSearchParams(window.location.search).get("workflow") ?? runFromUrl();
        setSelected(w.find((x) => x.id === wanted)?.id ?? w[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onPop = () => {
      const run = runFromUrl();
      setRunning(run);
      if (run) setSelected(run);
      else setLoading(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function openWorkflow(id: string) {
    if (id === running) return;
    setLoading(true); // the workflow clears this once its first data has loaded
    navigate(`/login?run=${id}`);
    window.scrollTo(0, 0);
  }

  function chooseWorkflow() {
    if (running) navigate("/login");
    window.scrollTo(0, 0);
  }

  const View = running ? VIEWS[user.portal][running] : undefined;
  const runningWorkflow = MENU_PAGES.find((p) => p.id === running) ?? workflows?.find((w) => w.id === running);
  const current = workflows?.find((w) => w.id === selected);
  const ready = useCallback(() => setLoading(false), []);

  // A ?run= for a workflow this account can't open falls back to the picker.
  useEffect(() => {
    if (running && !View) {
      setLoading(false);
      window.history.replaceState(null, "", "/login");
      setRunning(null);
    }
  }, [running, View]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <BrandLogo />
          <span className="divider" aria-hidden="true" />
          <span className="portal-chip">
            <span className="dot" aria-hidden="true" />
            <span>Welcome</span>
          </span>
        </div>
        <AccountMenu
          user={user}
          onLogout={onLogout}
          workflows={workflows}
          running={View ? running : null}
          onChooseWorkflow={chooseWorkflow}
          onOpenWorkflow={openWorkflow}
        />
      </header>
      <AutomationPopups userId={user.id} />

      {View && running ? (
        // Workflow page: the picker is gone; the hamburger menu leads back to it.
        <main className="content" key={running}>
          <div className="wf-page-head">
            <span className="wf-page-icon">{MENU_PAGES.some((p) => p.id === running) ? menuPageIcon(running, 28) : workflowIcon(running, 30)}</span>
            <div>
              <h1>{runningWorkflow?.label ?? "Workflow"}</h1>
              {runningWorkflow && <p>{runningWorkflow.description}</p>}
            </div>
          </div>
          <ErrorBoundary label={runningWorkflow?.label ?? "this workflow"} onError={ready}>
            <View onReady={ready} />
          </ErrorBoundary>
        </main>
      ) : (
        // Picker page: choose a workflow, then Run workflow opens it as its own page.
        <main className="content picker">
          <div className="greeting">
            <h1>
              {greeting()}, {shortName(user.name)}
            </h1>
            <p>Choose a workflow and select Run workflow.</p>
          </div>
          <section className="card run-bar" aria-labelledby="wf-label">
            <span id="wf-label" className="field-label">
              Workflow
            </span>
            {/* Dropdown and button share one row so they line up exactly. */}
            <div className="run-row">
              <div className="run-field">
                {workflows ? (
                  <WorkflowSelect options={workflows} value={selected} onChange={setSelected} labelId="wf-label" />
                ) : (
                  <div className="select-skeleton">
                    <Spinner /> Loading workflows
                  </div>
                )}
              </div>
              <button className="btn primary run-btn" onClick={() => selected && openWorkflow(selected)} disabled={!selected || loading}>
                {loading ? <Spinner /> : <IconPlay />} Run workflow
              </button>
            </div>
            {current && <p className="muted small run-desc">{current.description}</p>}
          </section>
          <ErrorNote error={error} />
        </main>
      )}
      {loading && <LoadingScreen label={`Opening ${runningWorkflow?.label ?? current?.label ?? "workflow"}`} />}
    </div>
  );
}
