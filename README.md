# Stargazer

Stargazer is an in-progress entertainment web app hosted on Cloudflare Pages.

## Current features
- Movie and TV search powered by TMDB
- Featured/trending home dashboard
- Continue Watching with saved VidUP playback progress
- My List saved locally on the device
- Recently watched history
- Because You Watched recommendations
- Popular movies and TV shows
- Top Rated catalog row
- Stargazer Live sports scoreboard and stream discovery
- Favorite live games and saved sport selection
- Particle effect customization
- Progressive Web App support with versioned service-worker caching
- Responsive desktop and mobile layouts

## Deployment
The site is designed for static deployment, including Cloudflare Pages.
# Stargazer v11

Notable v11 changes:

- Particle choices crossfade immediately in both the settings preview and the page behind it.
- Desktop detail cards are narrower; mobile styling is unchanged.
- Download is presented for movies only, never TV series.
- The player starts with VidUP and offers ten source options: VidUP, VidLink, VidFast, VidRock, Vidy, VidZee, and Viduki's four separate APIs. Viduki's options share a vendor; these are ten endpoints, not ten independent hosts.
- Viewers see the original animated loading scene with **Loading player 1/10**, not provider names or a source menu. The video fills the player again. A small retry icon is available after revealing playback.
- All attempts have a seven-second playback deadline and automatically advance when no playback is confirmed, including after an iframe loads. Confirmed play/status events or advancing playback time reveal the movie and stop the deadline. The loading screen has no Play button. Failure alerts advance immediately, without waiting for the deadline.
- Each attempt gets a new iframe window identity. The listener verifies both frame and exact provider origin, plus title/season/episode where supplied, before handling events. Timers and status polling are removed on close, success, replacement, or exhaustion.
- Public event integrations: VidUP, VidLink, VidFast, VidRock use `PLAYER_EVENT`; Vidy also sends JSON-string events; VidZee/Viduki use `MEDIA_DATA` progress. Historical progress only confirms playback when the active title/episode's time advances. VidFast's documented `getStatus` command is polled while loading. Viduki API 1's `viduki:all-servers-failed` notification immediately advances when its media identity matches.
- Not every provider publishes a failure/status API. Silent failures use the playback deadline; no private backend API, iframe load, or HTTP 200 response is treated as proof of a playable movie. Exhaustion shows a simple unavailable message with **Try again**.
- Source formats were checked against 1flex's public player integration and provider documentation on November 5, 2026. The app does not fetch or execute 1flex configuration at runtime. Source availability varies by title, region, and provider.
- Configure custom backup functions or URL templates with `window.STARGAZER_PLAYER_PROVIDERS` before `movies.js` loads. HTTPS URLs are deduplicated and the total remains capped at ten, with VidUP first.
- Run regression tests with `node --test tests/player-sources.test.cjs`. Endpoint HTTP checks are not end-to-end movie playback tests.
- Sports matching now scores both teams and event time, uses StreamFree's `strmfree.st` category stream API, and deliberately declines ambiguous matches instead of linking the wrong game.



## Player event references

- VidUP: https://vidup.to/ (Player Event Tracking)
- VidLink: https://vidlink.pro/ (PLAYER_EVENT, including the documented `mtmdbId` field)
- VidFast: https://vidfast.vc/ (Player Event Tracking and Player Control API)
- VidRock: https://vidrock.to/ (Player Events)
- Vidy: https://www.vidy.st/ (Talking to the parent page)
- Viduki: https://www.viduki.net/ (API 1 failure notification and watch progress)

These integrations use the public parent-window messaging APIs; error notification support varies by provider. Tests validate the documented payload shapes and UI/controller behavior, not availability of every movie.
