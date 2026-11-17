# Stargazer

Stargazer is a movie and TV discovery app with TMDB search, watch history, saved titles, and sports schedules and scores powered by ESPN. It is designed for static deployment. The Cloudflare Pages account API is separate from static hosting.

## Playback

Stargazer plays reviewed, ad-free MP4 or WebM files in the browser's native video player. Place media you have permission to host under `/media/` and register it in the `sources` object in `player-sources.js`.

```js
const sources = Object.freeze({
  "movie:42": "/media/movies/title.mp4",
  "tv:42:s1e2": "/media/tv/episode-2.webm"
});
```

The catalog starts empty. Titles without a matching file show an unavailable message. The live page shows schedules and scores while ad-free sports feeds are unavailable. Movie posters can be downloaded through the same-origin poster page.

The Cloudflare Pages and Vercel configurations block cross-origin frames and media. Serve files directly with the correct video MIME type and byte-range support so viewers can seek and resume. Review the media itself before adding it to the catalog.

Run the playback source tests with `node --test tests/player-sources.test.cjs`.
