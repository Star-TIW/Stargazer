import { searchSongs } from '../../lib/music-search.mjs';
export function onRequestGet({request}) { return searchSongs(request); }
