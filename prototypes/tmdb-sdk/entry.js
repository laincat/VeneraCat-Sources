import {TMDB} from 'tmdb-ts';
import URLSearchParams from 'core-js-pure/actual/url-search-params/index.js';
export async function searchSeries({accessToken, query}) {
  if (typeof globalThis.URLSearchParams !== 'function') globalThis.URLSearchParams = URLSearchParams;
  const sdk = new TMDB(accessToken, {fetch: (url, init) => fetch(url, init)});
  return sdk.search.tvShows({query, language: 'zh-CN', page: 1});
}
