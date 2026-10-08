import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FolderOpen, Home, Library, Link2, MoreHorizontal, NotebookPen, Plus, Search, Settings, Tags } from "lucide-react";
import { MODULES } from "../modules/registry";
import { AddVideoDialog } from "../components/AddVideoDialog";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { Sheet } from "../components/Sheet";
import { IconButton } from "../components/IconButton";

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

const PAGE_TITLES: [string, string][] = [
  ["/library", "Library"], ["/videos", "Videos"], ["/links", "Links"], ["/topics", "Topics"],
  ["/collections", "Collections"], ["/notes", "Notes"], ["/settings", "Settings"], ["/item", "Video"],
];
function pageTitle(path: string) {
  if (path === "/" || path === "/add") return "Home";
  return PAGE_TITLES.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? "RefVault";
}

/** Bookmark mark with a play notch; inherits the accent colour. */
function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 2.5h14a1 1 0 0 1 1 1V22l-8-5-8 5V3.5a1 1 0 0 1 1-1z" fill="currentColor" />
      <path d="M10 7.5v6l5-3z" fill="rgb(var(--paper))" />
    </svg>
  );
}

function NavItem({ to, label, icon: Icon, end, onClick }: { to: string; label: string; icon: typeof Home; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `relative flex h-10 items-center gap-3 rounded-ctl px-3 text-body transition-colors duration-100 ${
          isActive
            ? "bg-binding-wash font-medium text-binding before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-binding"
            : "text-ink-2 hover:bg-binding-wash/60 hover:text-ink"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </NavLink>
  );
}

function SoonItem({ label, icon: Icon }: { label: string; icon: typeof Home }) {
  return (
    <span aria-disabled="true" className="flex h-10 cursor-default items-center gap-3 px-3 text-body text-ink-2">
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {label}
      <span className="ms-auto text-small">soon</span>
    </span>
  );
}

function Sidebar() {
  return (
    <div className="flex min-h-full flex-col gap-6 px-3 py-5">
      <div className="flex items-center gap-2 px-3 text-binding">
        <Mark />
        <span className="font-serif text-[20px] font-semibold leading-none text-ink">RefVault</span>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {MAIN_NAV.map((n) => <NavItem key={n.to} {...n} />)}
      </nav>
      <nav className="flex flex-col gap-0.5" aria-label="Content">
        {MODULES.filter((m) => m.enabled).map((m) => <NavItem key={m.type} to={m.path} label={m.label} icon={m.icon} />)}
        {MODULES.filter((m) => !m.enabled).map((m) => <SoonItem key={m.type} label={m.label} icon={m.icon} />)}
      </nav>
      <nav className="flex flex-col gap-0.5" aria-label="Organize">
        {ORGANIZE_NAV.map((n) => <NavItem key={n.to} {...n} />)}
      </nav>
      <div className="mt-auto">
        <NavItem to="/settings" label="Settings" icon={Settings} />
      </div>
    </div>
  );
}

const RECENT_KEY = "refvault.recentSearches";
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
function pushRecent(q: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 6)));
  } catch {
    /* storage unavailable */
  }
}

function SearchBox({ inputRef, onDone, autoFocus }: { inputRef?: React.Ref<HTMLInputElement>; onDone?: () => void; autoFocus?: boolean }) {
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
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        if (t) pushRecent(t);
        navigate(t ? `/library?q=${encodeURIComponent(t)}` : "/library");
        onDone?.();
      }}
    >
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2" aria-hidden="true" />
      <input
        ref={inputRef}
        className="input ps-9 pe-10 [&::-webkit-search-cancel-button]:hidden"
        dir="auto"
        type="search"
        placeholder="Search videos, links, transcripts, notes"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && q) {
            e.preventDefault();
            e.stopPropagation();
            setQ("");
          }
        }}
        aria-label="Search your library"
      />
      <kbd className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-tab border border-line px-1.5 text-small text-ink-2 lg:block">/</kbd>
    </form>
  );
}

function SearchSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const recent = readRecent();
  return (
    <Sheet title="Search" onClose={onClose} placement="full" hideTitle>
      <div className="pt-1" data-autofocus-wrap>
        <SearchBox autoFocus onDone={onClose} />
        {recent.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-meta font-semibold text-ink-2">Recent searches</p>
            <ul>
              {recent.map((r) => (
                <li key={r}>
                  <button
                    className="flex min-h-[44px] w-full items-center text-start text-body hover:text-binding"
                    dir="auto"
                    onClick={() => { onClose(); navigate(`/library?q=${encodeURIComponent(r)}`); }}
                  >
                    {r}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function BottomBar({ onSave, onMore }: { onSave: () => void; onMore: () => void }) {
  const { pathname } = useLocation();
  const moreActive = ["/videos", "/topics", "/collections", "/notes", "/settings"].some((p) => pathname.startsWith(p));
  const slot = "flex h-14 flex-col items-center justify-center gap-0.5 text-small";
  const tab = ({ isActive }: { isActive: boolean }) => `${slot} ${isActive ? "text-binding" : "text-ink-2"}`;
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="grid grid-cols-5">
        <NavLink to="/" end className={tab}><Home className="h-5 w-5" aria-hidden="true" />Home</NavLink>
        <NavLink to="/library" className={tab}><Library className="h-5 w-5" aria-hidden="true" />Library</NavLink>
        <button type="button" onClick={onSave} className={`${slot} font-semibold text-binding`} aria-label="Save video">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-binding text-on-binding"><Plus className="h-5 w-5" aria-hidden="true" /></span>
          Save
        </button>
        <NavLink to="/links" className={tab}><Link2 className="h-5 w-5" aria-hidden="true" />Links</NavLink>
        <button type="button" onClick={onMore} className={`${slot} ${moreActive ? "text-binding" : "text-ink-2"}`}>
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />More
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="More" onClose={onClose}>
      <nav className="-mx-2 flex flex-col" aria-label="More">
        {MODULES.filter((m) => m.enabled).map((m) => <MoreLink key={m.type} to={m.path} label={m.label} icon={m.icon} onClick={onClose} />)}
        {[ORGANIZE_NAV[1], ORGANIZE_NAV[2], ORGANIZE_NAV[3]].map((n) => <MoreLink key={n.to} {...n} onClick={onClose} />)}
        <MoreLink to="/settings" label="Settings" icon={Settings} onClick={onClose} />
        {MODULES.filter((m) => !m.enabled).map((m) => (
          <span key={m.type} aria-disabled="true" className="flex min-h-[44px] items-center gap-3 px-2 text-body text-ink-2">
            <m.icon className="h-5 w-5" aria-hidden="true" /> {m.label} <span className="ms-auto text-small">soon</span>
          </span>
        ))}
      </nav>
    </Sheet>
  );
}
function MoreLink({ to, label, icon: Icon, onClick }: { to: string; label: string; icon: typeof Home; onClick: () => void }) {
  return (
    <NavLink to={to} onClick={onClick} className={({ isActive }) => `flex min-h-[44px] items-center gap-3 rounded-ctl px-2 text-body ${isActive ? "bg-binding-wash text-binding" : "text-ink"}`}>
      <Icon className="h-5 w-5" aria-hidden="true" /> {label}
    </NavLink>
  );
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

export function AppShell() {
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [more, setMore] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // /add?url=... (also the PWA share target) opens the Save sheet over Home.
  const sharedParams = new URLSearchParams(location.search);
  const isAddRoute = location.pathname === "/add";
  const sharedText = [sharedParams.get("url"), sharedParams.get("text"), sharedParams.get("title")].filter(Boolean).join(" ");

  // Global shortcuts: "/" searches, "n" opens Save. Ignored while typing or when an overlay is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "/") {
        e.preventDefault();
        if (window.matchMedia("(min-width: 1024px)").matches) searchRef.current?.focus();
        else setSearching(true);
      } else if (e.key === "n") {
        e.preventDefault();
        setAdding(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#main"
        className="btn-primary fixed start-3 top-3 z-[60] -translate-y-24 focus:translate-y-0"
        onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); mainRef.current?.scrollIntoView({ block: "start" }); }}
      >
        Skip to main content
      </a>
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-e border-line bg-paper lg:block">
        <Sidebar />
      </aside>

      <div className="min-w-0">
        {/* Desktop: search and Save */}
        <div className="sticky top-0 z-20 hidden h-14 items-center bg-paper px-8 lg:flex">
          <div className="flex w-full max-w-list items-center gap-3">
            <SearchBox inputRef={searchRef} />
            <button className="btn-primary btn-sm shrink-0" onClick={() => setAdding(true)} title="Save video (n)">
              <Plus className="h-4 w-4" aria-hidden="true" /> Save video
            </button>
          </div>
        </div>

        {/* Mobile: title and search */}
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between bg-paper ps-4 pe-2 lg:hidden">
          <p className="font-serif text-[20px] font-semibold leading-none">{pageTitle(location.pathname)}</p>
          <IconButton label="Search" onClick={() => setSearching(true)} className="sm:h-11 sm:w-11">
            <Search className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-item outline-none px-4 pb-24 pt-4 sm:px-8 lg:pb-16 lg:pt-6">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <BottomBar onSave={() => setAdding(true)} onMore={() => setMore(true)} />

      {searching && <SearchSheet onClose={() => setSearching(false)} />}
      {more && <MoreSheet onClose={() => setMore(false)} />}
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
