import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FolderOpen, Home, Library, Link2, Menu, NotebookPen, Plus, Search, Settings, Tags, X,
} from "lucide-react";
import { MODULES } from "../modules/registry";
import { AddVideoDialog } from "../components/AddVideoDialog";
import { ErrorBoundary } from "../components/ErrorBoundary";

const MAIN_NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/library", label: "Library", icon: Library },
];
const ORGANIZE_NAV = [
  { to: "/links", label: "Links", icon: Link2 },
  { to: "/topics", label: "Topics", icon: Tags },
  { to: "/collections", label: "Collections", icon: FolderOpen },
  { to: "/notes", label: "Notes", icon: NotebookPen },
];

function NavItem({ to, label, icon: Icon, end, onClick }: { to: string; label: string; icon: typeof Home; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive
            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  );
}

function Sidebar({ onNavigate, onAdd }: { onNavigate?: () => void; onAdd: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <div className="flex items-center gap-2.5 px-2">
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        <span className="text-lg font-semibold tracking-tight">RefVault</span>
      </div>

      <button className="btn-primary w-full" onClick={onAdd}>
        <Plus className="h-4 w-4" /> Save a video
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {MAIN_NAV.map((n) => <NavItem key={n.to} {...n} onClick={onNavigate} />)}
      </nav>

      <div>
        <p className="section-title mb-1.5 px-3">Content</p>
        <nav className="flex flex-col gap-0.5" aria-label="Content">
          {MODULES.filter((m) => m.enabled).map((m) => (
            <NavItem key={m.type} to={m.path} label={m.label} icon={m.icon} onClick={onNavigate} />
          ))}
          {MODULES.filter((m) => !m.enabled).map((m) => (
            <span key={m.type} className="flex cursor-default items-center gap-3 px-3 py-2 text-sm text-slate-400 dark:text-slate-600" title="Coming later">
              <m.icon className="h-4 w-4" /> {m.label}
              <span className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] uppercase dark:bg-slate-800">soon</span>
            </span>
          ))}
        </nav>
      </div>

      <div>
        <p className="section-title mb-1.5 px-3">Organize</p>
        <nav className="flex flex-col gap-0.5" aria-label="Organize">
          {ORGANIZE_NAV.map((n) => <NavItem key={n.to} {...n} onClick={onNavigate} />)}
        </nav>
      </div>

      <div className="mt-auto">
        <NavItem to="/settings" label="Settings" icon={Settings} onClick={onNavigate} />
      </div>
    </div>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    if (location.pathname === "/library") setQ(params.get("q") ?? "");
  }, [location.pathname, params]);

  return (
    <form
      role="search"
      className="relative w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/library?q=${encodeURIComponent(q.trim())}` : "/library");
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="input pl-9"
        dir="auto"
        type="search"
        placeholder="Search topics, transcripts, links, notes… (English / العربية)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search library"
      />
    </form>
  );
}

export function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const [adding, setAdding] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // /add?url=... (also the PWA share target) opens the dialog over Home.
  const sharedParams = new URLSearchParams(location.search);
  const isAddRoute = location.pathname === "/add";
  const sharedText = [sharedParams.get("url"), sharedParams.get("text"), sharedParams.get("title")].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        <Sidebar onAdd={() => setAdding(true)} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl dark:bg-slate-900">
            <button className="btn-ghost absolute right-2 top-3 p-2" onClick={() => setDrawer(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} onAdd={() => (setDrawer(false), setAdding(true))} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 sm:px-6">
        <button className="btn-ghost p-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <SearchBox />
        <button className="btn-primary ml-auto shrink-0 px-3 lg:hidden" onClick={() => setAdding(true)} aria-label="Save a video">
          <Plus className="h-4 w-4" />
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      {(adding || isAddRoute) && (
        <AddVideoDialog
          initialText={isAddRoute ? sharedText : ""}
          onClose={() => {
            setAdding(false);
            if (isAddRoute) navigate("/", { replace: true });
          }}
        />
      )}
    </div>
  );
}
