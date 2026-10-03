import { createMemo, createSignal, Show } from 'solid-js';
import { createRouter, defineRoutes, useNavigate, useLocation } from '@solidjs/router';
import { Generate } from './routes/Generate.js';
import { History } from './routes/History.js';
import { fetchCountries } from './api.js';
import type { CountryZone, GenerationRequest } from './types.js';

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

/**
 * Plain anchors are used for navigation; this highlights the active one.
 *
 * The brand reuses this so the home link behaves identically to the nav links:
 * modified clicks still open a new tab, and routing stays in the router.
 * `active` is merged with any caller-supplied class rather than replacing it.
 */
function NavLink(props: { href: string; children: string; class?: string }) {
  const location = useLocation();
  const active = createMemo(() => location.pathname === props.href);
  const navigate = useNavigate();

  return (
    <a
      href={props.href}
      class={[props.class, { active: active() }]}
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

/**
 * Route contents, selected without relying on router component exports.
 *
 * `prefill` carries the choices of a history entry into a fresh generation.
 * It lives in App because the two routes are siblings, and it is handed back
 * as null once the form has taken it, so returning to Generate later starts
 * blank rather than silently resurrecting the last reused invitation.
 */
function Outlet(props: {
  countries: CountryZone[];
  prefill: GenerationRequest | null;
  onPrefillChange: (request: GenerationRequest | null) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Show when={location.pathname === '/history'} fallback={
      <Generate
        countries={props.countries}
        initial={props.prefill}
        onInitialConsumed={() => props.onPrefillChange(null)}
        onGenerated={() => navigate('/history')}
      />
    }>
      <History
        onReuse={(request) => {
          props.onPrefillChange(request);
          navigate('/');
        }}
      />
    </Show>
  );
}

export function App() {
  const [countries, setCountries] = createSignal<CountryZone[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [prefill, setPrefill] = createSignal<GenerationRequest | null>(null);

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
            <NavLink href="/" class="brand">Wedding Invitations</NavLink>
            <nav>
              <NavLink href="/">Generate</NavLink>
              <NavLink href="/history">History</NavLink>
            </nav>
          </header>

          <main>
            <Show when={error()}>
              <p class="error">{error()}</p>
            </Show>
            <Outlet
              countries={countries()}
              prefill={prefill()}
              onPrefillChange={setPrefill}
            />
          </main>

          <footer class="foot">
            <span>Oleg &amp; Rose — 13 October 2026</span>
          </footer>
        </div>
      )}
    </Router>
  );
}
