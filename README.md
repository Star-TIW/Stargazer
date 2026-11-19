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

Titles without a registered file use the embedded movie and episode providers. Switch source inside the player if a provider is unavailable. Movie downloads use a registered file when present or open VidVault's download options. Live sports use the existing StreamFree integration. Player frames start with popup and top navigation restrictions. A viewer can enable Compatibility mode for providers that reject sandboxing. This reloads the current provider with standard iframe permissions, including popups. Closing the player resets the choice. Downloads retain their separate sandbox. Third-party availability and content inside a frame depend on its provider.

Run the playback tests with `node --test tests/*.test.cjs`.
