import { createMemo, createSignal, Show } from 'solid-js';
import { createRouter, defineRoutes, useNavigate, useLocation } from '@solidjs/router';
import { Generate } from './routes/Generate.js';
import { History } from './routes/History.js';
import { fetchCountries } from './api.js';
import type { CountryZone } from './types.js';

/**
 * Router v2 takes a route tree up front and renders through its own provider.
 *
 * Country data is app-wide and static, so it is fetched once here and passed
 * down rather than refetched per route.
 */
const routes = defineRoutes([
  { path: '/', component: () => null },
  { path: '/history', component: () => null },
]);

const Router = createRouter({ routes });

/** Plain anchors are used for navigation; this highlights the active one. */
function NavLink(props: { href: string; children: string }) {
  const location = useLocation();
  const active = createMemo(() => location.pathname === props.href);
  const navigate = useNavigate();

  return (
    <a
      href={props.href}
      class={{ active: active() }}
      onClick={(e) => {
        // Let modified clicks open a new tab as usual.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(props.href);
      }}
    >
      {props.children}
    </a>
  );
}

/** Route contents, selected without relying on router component exports. */
function Outlet(props: { countries: CountryZone[] }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Show when={location.pathname === '/history'} fallback={
      <Generate
        countries={props.countries}
        onGenerated={() => navigate('/history')}
      />
    }>
      <History />
    </Show>
  );
}

export function App() {
  const [countries, setCountries] = createSignal<CountryZone[]>([]);
  const [error, setError] = createSignal<string | null>(null);

  void fetchCountries()
    .then(setCountries)
    .catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load countries'),
    );

  return (
    <Router>
      {() => (
        <div class="app">
          <header class="topbar">
            <span class="brand">Wedding Invitations</span>
            <nav>
              <NavLink href="/">Generate</NavLink>
              <NavLink href="/history">History</NavLink>
            </nav>
          </header>

          <main>
            <Show when={error()}>
              <p class="error">{error()}</p>
            </Show>
            <Outlet countries={countries()} />
          </main>

          <footer class="foot">
            <span>Oleg &amp; Rose — 13 October 2026</span>
          </footer>
        </div>
      )}
    </Router>
  );
}
