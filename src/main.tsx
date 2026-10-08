import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "./index.css";
import { isConfigured } from "./lib/supabase";
import { SessionProvider, useSession } from "./lib/auth";
import { AppShell } from "./layout/AppShell";
import { Spinner } from "./components/ui";
import { Login, NotConfigured } from "./pages/Login";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { ItemPage } from "./pages/ItemPage";
import { Links } from "./pages/Links";
import { Topics } from "./pages/Topics";
import { Collections } from "./pages/Collections";
import { Notes } from "./pages/Notes";
import { Settings } from "./pages/Settings";
import { MODULES } from "./modules/registry";
import { ErrorBoundary } from "./components/ErrorBoundary";

function NotFound() {
  return (
    <div className="py-12">
      <h1 className="text-title">Page not found</h1>
      <p className="mt-2 text-body text-ink-2">This address doesn't match any page in your library.</p>
      <Link to="/" className="btn-primary mt-5">Go to Home</Link>
    </div>
  );
}

function App() {
  const { session, loading } = useSession();
  if (!isConfigured) return <NotConfigured />;
  if (loading) return <div className="flex justify-center pt-24"><Spinner /></div>;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="add" element={<Home />} />
        <Route path="library" element={<Library />} />
        {MODULES.filter((m) => m.enabled).map((m) => (
          <Route key={m.type} path={m.path.slice(1)} element={<Library key={m.type} type={m.type} />} />
        ))}
        <Route path="item/:id" element={<ItemPage />} />
        <Route path="links" element={<Links />} />
        <Route path="topics" element={<Topics />} />
        <Route path="collections" element={<Collections />} />
        <Route path="notes" element={<Notes />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
    <SessionProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SessionProvider>
    </ErrorBoundary>
  </StrictMode>,
);
