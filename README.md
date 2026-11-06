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
- Failed frame loads, 20-second load deadlines, and validated player error messages advance to the next untried source. VidUP also has a playback deadline. Successful playback or user interaction cancels that deadline.
- Cross-origin iframe loads do not prove playback works. Providers without a known playback event remain visible after loading so a working player is not interrupted. Use **Try next source** or the source menu if the embedded player reports an error internally. Exhaustion stops retries; a source can be selected again manually.
- Source formats were checked against 1flex's public player integration and provider documentation on November 5, 2026. The app does not fetch or execute 1flex configuration at runtime. Source availability varies by title, region, and provider.
- Configure custom backup functions or URL templates with `window.STARGAZER_PLAYER_PROVIDERS` before `movies.js` loads. HTTPS URLs are deduplicated and the total remains capped at ten, with VidUP first.
- Run regression tests with `node --test tests/player-sources.test.cjs`. Endpoint HTTP checks are not end-to-end movie playback tests.
- Sports matching now scores both teams and event time, uses StreamFree's `strmfree.st` category stream API, and deliberately declines ambiguous matches instead of linking the wrong game.


