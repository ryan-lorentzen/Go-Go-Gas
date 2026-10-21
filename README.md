# Go Go Gas!

Go Go Gas! is a browser-based gas station finder and fuel-aware road-trip planner. Find nearby stations with live fuel prices, compare them on a map, or plan a longer drive with fuel stops based on your vehicle's estimated range.

## Features

### Interface

- Three sections: Map, Local Gas, and Commuter Gas, with safe-area-aware bottom navigation on mobile and header navigation on desktop.
- Local Gas contains the fuel-grade and radius search controls and sortable station rows with aligned prices. The Map tab displays those results, expandable station details, and directions without duplicate search controls.
- Saved commute details and the next required action appear before the expandable form for planning another route.

### Nearby gas stations

- Uses browser geolocation to search around your current location.
- Finds stations with live prices through Google Places (New).
- Filter results by fuel grade (regular, midgrade, premium, or diesel) and search radius.
- Rank stations by score, price, or distance.
- Browse station prices and locations on an interactive Leaflet map; select a station to inspect it and route to it.
- Expand Directions below the map for turn-by-turn instructions, route distance, and drive time to the selected station. The route stays visible without an instructions overlay. If directions are unavailable, use Open in Maps; fallback trip estimates are not turn-by-turn directions.
- Handles denied location access, missing configuration, empty results, and changing searches with user-facing status messages.

### Fuel-smart commute planning

- Search and select a destination using Google Places address autocomplete.
- Plan a road route from your current location using your current and full-tank ranges and preferred fuel grade.
- Suggest gas stops along the route and show stop order, prices when available, and leg distances.
- New commute plans only select stations whose price for the selected fuel grade was updated within the last 48 hours. Prices with missing, invalid, or future timestamps are excluded. If a required stop has no qualifying safely reachable station, planning fails rather than using stale prices. Saved plans are not automatically refreshed; Local Gas results are unchanged.
- View the route on the map or open the next stop in a preferred maps app.
- Track progress stop by stop: enter your updated range before continuing, with a safety check for the next leg.
- Skip the next fuel stop, including while prompted for an updated range, after confirming the fuel-range warning to immediately select the following stop. Skipped stops remain labeled in your saved plan. Skipping does not update your range or recalculate the route; check that you have enough fuel to continue. The final destination cannot be skipped.
- Save one active plan in browser storage for up to seven days. Reloading restores the plan without repeating the planning requests; clear it manually, especially on shared devices.
- Uses OSRM road routing. Commute planning reports an error if routing is unavailable rather than substituting straight-line estimates. Browser location tracking only works while the site is open.

## Tech stack

- **Next.js 15** (App Router) and **React 19** with TypeScript
- **Tailwind CSS 4** for responsive styling
- **Leaflet** and **React Leaflet** for client-only maps and route display
- **Zustand** for location and commute-plan state
- **Google Places API (New)** for gas-station search, destination autocomplete, and place details
- **OSRM-compatible routing service** for road directions and commute planning

## Getting started

Requirements: Node.js and npm.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and allow location access to find nearby stations or plan a route. Stop the development server with Ctrl+C.

## Configuration

Create a local `.env.local` file in the repository root for live Google Places features:

```dotenv
GOOGLE_PLACES_API_KEY=your-key
```

Enable **Places API (New)** for the key. Station search uses the server-side `/api/gas-prices` route; destination suggestions and selection use Autocomplete (New) and Place Details (New). Autocomplete requests are grouped with session tokens. The key stays on the server and must not be exposed in browser code or committed to source control.

Commute planning uses OSRM. The endpoint can be configured as:

```dotenv
OSRM_BASE_URL=https://router.project-osrm.org
```

The public OSRM endpoint is best-effort. Configure a managed or self-hosted OSRM-compatible service for production reliability. If routing is unavailable, commute planning fails safely.

## Commands

```bash
npm ci          # install the exact dependencies from package-lock.json
npm run dev     # start the local development server
npm run lint    # run ESLint
npm run build   # create a production build
npm run start   # serve the production build (run build first)
```

There is currently no unit-test script. Validate changes with lint, build, and relevant browser checks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, commit message conventions, verification checks, and the `develop` → `main` pull-request workflow.

## Project structure

- `src/app/` — App Router page, layout, styles, and API routes
- `src/app/page.tsx` — gas finder page and client-side app orchestration
- `src/app/api/` — server-side gas search, geocoding, and commute-planning endpoints
- `src/features/map/` — Leaflet map, markers, and route display
- `src/features/commute/` — commute planning and progress UI
- `src/GasPrices/` and `src/Commute/` — Google Places and commute API clients
- `src/lib/` — shared route, map-link, and server routing utilities
- `src/store/` — Zustand location and commute-plan stores
- `src/types/` — shared domain types
- `public/images/leaflet/` — Leaflet marker assets

## Deployment

Deploy as a Next.js project from the repository root (for example, on Vercel). Use `npm ci` for installation and `npm run build` for the build command. Configure `GOOGLE_PLACES_API_KEY` and, if needed, `OSRM_BASE_URL` in the hosting provider's environment settings for each target environment. Do not commit `.env` files, API keys, or generated build output.
