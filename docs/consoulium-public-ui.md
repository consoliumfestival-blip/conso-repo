# Consoulium public UI

The custom Consoulium homepage and festival pages are served by the existing
Cloudflare Pages project on the main Conso domain. Expo's `build:web` copies the
files in `public/` into `dist/` alongside the main application. The main app's
`/` route and its admin and tenant flows remain separate. The custom homepage
is `/consoulium`; its Results, Standings, and Schedule links lead to the
three `/festival-*.html` pages.

The homepage assets came from the local `mhdasjidp/consolium2k26asjid` checkout
at commit `f72d8867425933faf6e6efae04b8943175debdc9`, including local UI
changes present on 2026-11-17. That checkout was not modified for this import.
Its supplied homepage was a prebuilt JavaScript bundle. The imported
`RouteLink-conso-a70430b7.js` changes only its homepage route from `/` to
`/consoulium`; `nav-routes.js` adapts the prebuilt navigation to the
festival pages and carries `tenant_id`. This is a distributable static bundle,
so editing the separate checkout's TSX files does not rebuild these assets.
Future homepage design changes require recovering or establishing a verified
source build pipeline before replacing the bundle.

The imported bundle's Register actions intentionally use `#` because no
external registration URL is required. The copied Konfhub event label was
removed, and the calendar entry uses Nov 26-29, matching the displayed event
dates (with Nov 30 as the calendar format's exclusive end date).

The festival pages use the existing same-origin `public-version` and
`public-snapshot` Pages Functions. The Public Page and Leaderboard switches,
tenant-scoped data selection, publication checks, and 60-second snapshot lease
remain controlled by the main Conso backend. The UI import changes no Supabase
schema, migration, or API contract. Gallery, News, Media, and Brochure stay
visibly pending in the custom homepage navigation.
