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
- The player uses a six-second watchdog for each configured provider (up to five), handles explicit player errors, clears timers on close/success, and displays an unavailable message after every candidate fails. Configure extra authorized providers with `window.STARGAZER_PLAYER_PROVIDERS` before `movies.js` loads.
- Sports matching now scores both teams and event time, uses StreamFree's category stream API, and deliberately declines ambiguous matches instead of linking the wrong game.


