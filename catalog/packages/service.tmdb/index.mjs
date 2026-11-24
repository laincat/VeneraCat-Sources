// SPDX-License-Identifier: LGPL-3.0-or-later
// VeneraCat service plugin: TMDB (API v3)

const SERVICE_ID = 'service.tmdb';
const API_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/';
const DEFAULT_LANGUAGE = 'zh-CN';
const SEARCH_TYPES = { multi: true, movie: true, tv: true, person: true };
const MEDIA_TYPES = { movie: true, tv: true };

function okResult(method, data) {
  return { ok: true, service: SERVICE_ID, method, data };
}

function errorResult(method, code, message, extra) {
  const err = { code, message };
  if (extra && typeof extra === 'object') {
    for (const key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key) && extra[key] !== undefined) {
        err[key] = extra[key];
      }
    }
  }
  return { ok: false, service: SERVICE_ID, method, error: err };
}

function safeLog(level, message) {
  try {
    if (typeof log === 'function') {
      log(level, String(message));
    }
  } catch (_) {
    // Logging must never break execution.
  }
}

function safeStorageGet(key) {
  try {
    if (typeof storageGet === 'function') {
      const value = storageGet(key);
      return typeof value === 'string' && value.length > 0 ? value : null;
    }
  } catch (_) {
    // Ignore when storage permission is withheld.
  }
  return null;
}

function safeStorageSet(key, value) {
  try {
    if (typeof storageSet === 'function') {
      storageSet(key, String(value));
      return true;
    }
  } catch (_) {
    // Ignore when storage permission is withheld.
  }
  return false;
}

function redactSecrets(text, secretValues) {
  let out = String(text || '');
  if (Array.isArray(secretValues)) {
    for (let i = 0; i < secretValues.length; i++) {
      const raw = secretValues[i];
      if (typeof raw !== 'string' || raw.length === 0) continue;
      out = out.split(raw).join('[REDACTED]');
      try {
        const encoded = encodeURIComponent(raw);
        if (encoded && encoded !== raw) {
          out = out.split(encoded).join('[REDACTED]');
        }
      } catch (_) {
        // Ignore encoding errors.
      }
    }
  }
  out = out.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
  out = out.replace(/([?&]api_key=)[^&\s"']+/gi, '$1[REDACTED]');
  return out;
}

function tryReadSecret(key) {
  try {
    const raw = secret(key);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return { ok: true, value: raw.trim() };
    }
    return { ok: false, denied: false };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    const lower = msg.toLowerCase();
    const denied = lower.indexOf('permission') >= 0 || lower.indexOf('no account values') >= 0;
    return { ok: false, denied };
  }
}

function resolveAuth() {
  const bearer = tryReadSecret('api_read_token');
  if (bearer.ok) {
    return { ok: true, mode: 'bearer', token: bearer.value, secrets: [bearer.value] };
  }
  const apiKey = tryReadSecret('api_key');
  if (apiKey.ok) {
    return { ok: true, mode: 'api_key', apiKey: apiKey.value, secrets: [apiKey.value] };
  }
  if (bearer.denied || apiKey.denied) {
    return {
      ok: false,
      code: 'SECRET_UNAVAILABLE',
      message: 'Host refused access to TMDB credentials ("api_read_token" or "api_key").',
      missingSecrets: ['api_read_token', 'api_key']
    };
  }
  return {
    ok: false,
    code: 'MISSING_SECRET',
    message: 'TMDB requires either secret "api_read_token" or secret "api_key".',
    missingSecrets: ['api_read_token', 'api_key']
  };
}

function parsePayload(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: {} };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ok: true, value: raw };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === 'null') {
      return { ok: true, value: {} };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null || parsed === undefined) return { ok: true, value: {} };
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, message: 'Payload must be a JSON object.' };
      }
      return { ok: true, value: parsed };
    } catch (_) {
      return { ok: false, message: 'Payload is not valid JSON.' };
    }
  }
  return { ok: false, message: 'Payload must be a JSON string or object.' };
}

function buildQuery(params) {
  const parts = [];
  for (const key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
    const val = params[key];
    if (val === undefined || val === null || val === '') continue;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(val)));
  }
  return parts.length > 0 ? '?' + parts.join('&') : '';
}

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function toNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function imageUrl(filePath, size) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  return IMAGE_BASE + (size || 'w500') + filePath;
}

function resolveLanguage(payload) {
  if (payload && typeof payload.language === 'string' && payload.language.trim().length > 0) {
    return payload.language.trim();
  }
  return safeStorageGet('default_language') || DEFAULT_LANGUAGE;
}

function requestTmdb(path, queryParams, auth) {
  const params = {};
  if (queryParams && typeof queryParams === 'object') {
    for (const key in queryParams) {
      if (Object.prototype.hasOwnProperty.call(queryParams, key)) {
        params[key] = queryParams[key];
      }
    }
  }
  const headers = { Accept: 'application/json' };
  if (auth.mode === 'bearer') {
    headers.Authorization = 'Bearer ' + auth.token;
  } else {
    params.api_key = auth.apiKey;
  }

  const url = API_BASE + path + buildQuery(params);
  let raw;
  try {
    raw = fetch(url, { method: 'GET', headers });
  } catch (err) {
    const rawMsg = err && err.message ? String(err.message) : String(err);
    const wrapped = new Error(redactSecrets(rawMsg, auth.secrets));
    wrapped.code = 'NETWORK_ERROR';
    throw wrapped;
  }

  let status = 200;
  let text = '';
  if (typeof raw === 'string') {
    text = raw;
  } else if (raw && typeof raw === 'object') {
    if (typeof raw.status === 'number') status = raw.status;
    if (typeof raw.text === 'function') text = String(raw.text());
    else if (typeof raw.body === 'string') text = raw.body;
    if (raw.ok === false || status < 200 || status >= 300) {
      const err = new Error('TMDB API returned HTTP ' + status);
      err.code = status === 401 || status === 403 ? 'AUTH_ERROR' : 'HTTP_ERROR';
      err.status = status;
      throw err;
    }
  }

  if (!text || text.trim().length === 0) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const err = new Error('Invalid JSON response from TMDB API.');
    err.code = 'INVALID_UPSTREAM_JSON';
    throw err;
  }
}

function normalizeSearchItem(item, fallbackType) {
  if (!item || typeof item !== 'object') return null;
  const mediaType = item.media_type || fallbackType;
  return {
    id: item.id,
    mediaType,
    title: item.title || item.name || '',
    originalTitle: item.original_title || item.original_name || '',
    overview: item.overview || '',
    releaseDate: item.release_date || item.first_air_date || '',
    voteAverage: typeof item.vote_average === 'number' ? item.vote_average : null,
    voteCount: typeof item.vote_count === 'number' ? item.vote_count : null,
    popularity: typeof item.popularity === 'number' ? item.popularity : null,
    posterPath: item.poster_path || null,
    posterUrl: imageUrl(item.poster_path, 'w500'),
    backdropPath: item.backdrop_path || null,
    backdropUrl: imageUrl(item.backdrop_path, 'w780'),
    profilePath: item.profile_path || null,
    profileUrl: imageUrl(item.profile_path, 'w185'),
    genreIds: Array.isArray(item.genre_ids) ? item.genre_ids : []
  };
}

function normalizeArtworkList(list, fullSize, previewSize) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const img = list[i];
    if (!img || typeof img !== 'object' || typeof img.file_path !== 'string') continue;
    out.push({
      filePath: img.file_path,
      url: imageUrl(img.file_path, fullSize),
      previewUrl: imageUrl(img.file_path, previewSize),
      width: typeof img.width === 'number' ? img.width : null,
      height: typeof img.height === 'number' ? img.height : null,
      aspectRatio: typeof img.aspect_ratio === 'number' ? img.aspect_ratio : null,
      iso6391: img.iso_639_1 || null,
      voteAverage: typeof img.vote_average === 'number' ? img.vote_average : null,
      voteCount: typeof img.vote_count === 'number' ? img.vote_count : null
    });
  }
  return out;
}

function handleMetadataSearch(payload, auth) {
  const query = typeof payload.query === 'string'
    ? payload.query.trim()
    : (typeof payload.keyword === 'string' ? payload.keyword.trim() : '');
  if (!query) {
    return errorResult('metadata.search', 'INVALID_PARAMS', 'Field "query" is required.');
  }
  const mediaType = typeof payload.mediaType === 'string' && payload.mediaType.trim()
    ? payload.mediaType.trim().toLowerCase()
    : 'multi';
  if (!SEARCH_TYPES[mediaType]) {
    return errorResult('metadata.search', 'INVALID_PARAMS', 'Field "mediaType" must be one of multi, movie, tv, person.');
  }
  const page = toPositiveInt(payload.page) || 1;
  const language = resolveLanguage(payload);
  const queryParams = {
    query,
    page,
    language,
    include_adult: payload.includeAdult === true ? 'true' : 'false'
  };
  if (payload.year !== undefined && payload.year !== null && payload.year !== '') {
    if (mediaType === 'tv') {
      queryParams.first_air_date_year = payload.year;
    } else if (mediaType === 'movie') {
      queryParams.year = payload.year;
    }
  }

  safeLog('info', 'tmdb metadata.search -> GET /3/search/' + mediaType);
  const body = requestTmdb('/search/' + mediaType, queryParams, auth) || {};
  const results = Array.isArray(body.results) ? body.results : [];
  const items = [];
  for (let i = 0; i < results.length; i++) {
    const normalized = normalizeSearchItem(results[i], mediaType === 'multi' ? 'unknown' : mediaType);
    if (normalized) items.push(normalized);
  }
  return okResult('metadata.search', {
    query,
    mediaType,
    language,
    page: typeof body.page === 'number' ? body.page : page,
    totalPages: typeof body.total_pages === 'number' ? body.total_pages : 1,
    totalResults: typeof body.total_results === 'number' ? body.total_results : items.length,
    items
  });
}

function handleMetadataDetail(payload, auth) {
  const id = toPositiveInt(payload.id);
  if (!id) {
    return errorResult('metadata.detail', 'INVALID_PARAMS', 'Positive integer "id" is required.');
  }
  const rawSeason = payload.seasonNumber !== undefined ? payload.seasonNumber : payload.season_number;
  const rawEpisode = payload.episodeNumber !== undefined ? payload.episodeNumber : payload.episode_number;
  const inferredType = rawSeason !== undefined ? 'tv' : '';
  const mediaType = typeof payload.mediaType === 'string' && payload.mediaType.trim()
    ? payload.mediaType.trim().toLowerCase()
    : inferredType;
  if (!MEDIA_TYPES[mediaType]) {
    return errorResult('metadata.detail', 'INVALID_PARAMS', 'Field "mediaType" must be "movie" or "tv".');
  }

  const language = resolveLanguage(payload);
  const queryParams = { language };
  if (typeof payload.appendToResponse === 'string' && payload.appendToResponse.trim()) {
    queryParams.append_to_response = payload.appendToResponse.trim();
  } else if (Array.isArray(payload.appendToResponse) && payload.appendToResponse.length > 0) {
    queryParams.append_to_response = payload.appendToResponse.join(',');
  }

  if (mediaType === 'tv' && rawSeason !== undefined && rawSeason !== null && rawSeason !== '') {
    const seasonNumber = toNonNegativeInt(rawSeason);
    if (seasonNumber === null) {
      return errorResult('metadata.detail', 'INVALID_PARAMS', 'Field "seasonNumber" must be a non-negative integer.');
    }
    if (rawEpisode !== undefined && rawEpisode !== null && rawEpisode !== '') {
      const episodeNumber = toPositiveInt(rawEpisode);
      if (!episodeNumber) {
        return errorResult('metadata.detail', 'INVALID_PARAMS', 'Field "episodeNumber" must be a positive integer.');
      }
      const path = '/tv/' + id + '/season/' + seasonNumber + '/episode/' + episodeNumber;
      safeLog('info', 'tmdb metadata.detail -> GET /3' + path);
      const ep = requestTmdb(path, queryParams, auth) || {};
      return okResult('metadata.detail', {
        id: ep.id,
        tvId: id,
        mediaType: 'episode',
        seasonNumber: typeof ep.season_number === 'number' ? ep.season_number : seasonNumber,
        episodeNumber: typeof ep.episode_number === 'number' ? ep.episode_number : episodeNumber,
        name: ep.name || '',
        overview: ep.overview || '',
        airDate: ep.air_date || '',
        runtime: typeof ep.runtime === 'number' ? ep.runtime : null,
        voteAverage: typeof ep.vote_average === 'number' ? ep.vote_average : null,
        stillPath: ep.still_path || null,
        stillUrl: imageUrl(ep.still_path, 'w780')
      });
    }

    const path = '/tv/' + id + '/season/' + seasonNumber;
    safeLog('info', 'tmdb metadata.detail -> GET /3' + path);
    const season = requestTmdb(path, queryParams, auth) || {};
    const episodes = [];
    if (Array.isArray(season.episodes)) {
      for (let i = 0; i < season.episodes.length; i++) {
        const ep = season.episodes[i];
        if (!ep || typeof ep !== 'object') continue;
        episodes.push({
          id: ep.id,
          seasonNumber: ep.season_number,
          episodeNumber: ep.episode_number,
          name: ep.name || '',
          overview: ep.overview || '',
          airDate: ep.air_date || '',
          runtime: typeof ep.runtime === 'number' ? ep.runtime : null,
          voteAverage: typeof ep.vote_average === 'number' ? ep.vote_average : null,
          stillPath: ep.still_path || null,
          stillUrl: imageUrl(ep.still_path, 'w500')
        });
      }
    }
    return okResult('metadata.detail', {
      id: season.id,
      tvId: id,
      mediaType: 'season',
      seasonNumber: typeof season.season_number === 'number' ? season.season_number : seasonNumber,
      name: season.name || '',
      overview: season.overview || '',
      airDate: season.air_date || '',
      posterPath: season.poster_path || null,
      posterUrl: imageUrl(season.poster_path, 'w500'),
      episodes
    });
  }

  const path = '/' + mediaType + '/' + id;
  safeLog('info', 'tmdb metadata.detail -> GET /3' + path);
  const body = requestTmdb(path, queryParams, auth) || {};
  safeStorageSet('last_detail_ref', mediaType + ':' + id);

  const seasons = [];
  if (Array.isArray(body.seasons)) {
    for (let i = 0; i < body.seasons.length; i++) {
      const s = body.seasons[i];
      if (!s || typeof s !== 'object') continue;
      seasons.push({
        id: s.id,
        seasonNumber: s.season_number,
        name: s.name || '',
        episodeCount: typeof s.episode_count === 'number' ? s.episode_count : null,
        airDate: s.air_date || '',
        posterPath: s.poster_path || null,
        posterUrl: imageUrl(s.poster_path, 'w500')
      });
    }
  }

  return okResult('metadata.detail', {
    id: body.id || id,
    mediaType,
    title: body.title || body.name || '',
    originalTitle: body.original_title || body.original_name || '',
    tagline: body.tagline || '',
    overview: body.overview || '',
    status: body.status || '',
    releaseDate: body.release_date || body.first_air_date || '',
    lastAirDate: body.last_air_date || '',
    runtime: typeof body.runtime === 'number' ? body.runtime : null,
    numberOfSeasons: typeof body.number_of_seasons === 'number' ? body.number_of_seasons : null,
    numberOfEpisodes: typeof body.number_of_episodes === 'number' ? body.number_of_episodes : null,
    voteAverage: typeof body.vote_average === 'number' ? body.vote_average : null,
    voteCount: typeof body.vote_count === 'number' ? body.vote_count : null,
    genres: Array.isArray(body.genres) ? body.genres : [],
    posterPath: body.poster_path || null,
    posterUrl: imageUrl(body.poster_path, 'w500'),
    backdropPath: body.backdrop_path || null,
    backdropUrl: imageUrl(body.backdrop_path, 'w1280'),
    seasons
  });
}

function handleArtworkList(payload, auth) {
  const id = toPositiveInt(payload.id);
  if (!id) {
    return errorResult('artwork.list', 'INVALID_PARAMS', 'Positive integer "id" is required.');
  }
  const rawSeason = payload.seasonNumber !== undefined ? payload.seasonNumber : payload.season_number;
  const rawEpisode = payload.episodeNumber !== undefined ? payload.episodeNumber : payload.episode_number;
  const mediaType = typeof payload.mediaType === 'string' && payload.mediaType.trim()
    ? payload.mediaType.trim().toLowerCase()
    : (rawSeason !== undefined ? 'tv' : '');
  if (!MEDIA_TYPES[mediaType]) {
    return errorResult('artwork.list', 'INVALID_PARAMS', 'Field "mediaType" must be "movie" or "tv".');
  }

  let path = '/' + mediaType + '/' + id + '/images';
  if (mediaType === 'tv' && rawSeason !== undefined && rawSeason !== null && rawSeason !== '') {
    const seasonNumber = toNonNegativeInt(rawSeason);
    if (seasonNumber === null) {
      return errorResult('artwork.list', 'INVALID_PARAMS', 'Field "seasonNumber" must be a non-negative integer.');
    }
    if (rawEpisode !== undefined && rawEpisode !== null && rawEpisode !== '') {
      const episodeNumber = toPositiveInt(rawEpisode);
      if (!episodeNumber) {
        return errorResult('artwork.list', 'INVALID_PARAMS', 'Field "episodeNumber" must be a positive integer.');
      }
      path = '/tv/' + id + '/season/' + seasonNumber + '/episode/' + episodeNumber + '/images';
    } else {
      path = '/tv/' + id + '/season/' + seasonNumber + '/images';
    }
  }

  const includeImageLanguage = typeof payload.includeImageLanguage === 'string' && payload.includeImageLanguage.trim()
    ? payload.includeImageLanguage.trim()
    : 'zh,en,null';
  const fullSize = typeof payload.size === 'string' && payload.size.trim() ? payload.size.trim() : 'original';
  const previewSize = typeof payload.previewSize === 'string' && payload.previewSize.trim() ? payload.previewSize.trim() : 'w500';

  safeLog('info', 'tmdb artwork.list -> GET /3' + path);
  const body = requestTmdb(path, { include_image_language: includeImageLanguage }, auth) || {};
  return okResult('artwork.list', {
    id: body.id || id,
    mediaType,
    baseUrl: IMAGE_BASE,
    posters: normalizeArtworkList(body.posters, fullSize, previewSize),
    backdrops: normalizeArtworkList(body.backdrops, fullSize, previewSize),
    logos: normalizeArtworkList(body.logos, fullSize, previewSize),
    stills: normalizeArtworkList(body.stills, fullSize, previewSize)
  });
}

export function describe() {
  return {
    methods: [
      { name: 'metadata.search', title: '多类型搜索 / Multi Search' },
      { name: 'metadata.detail', title: '影视与季集详情 / Media & Season Detail' },
      { name: 'artwork.list', title: '海报与背景图集 / Artwork Gallery' }
    ]
  };
}

export function handle(method, payload) {
  const parsed = parsePayload(payload);
  if (!parsed.ok) {
    return errorResult(method, 'INVALID_PAYLOAD', parsed.message);
  }
  const input = parsed.value;

  if (method !== 'metadata.search' && method !== 'metadata.detail' && method !== 'artwork.list') {
    return errorResult(method, 'UNSUPPORTED_METHOD', 'Unsupported TMDB method "' + String(method) + '".');
  }

  const auth = resolveAuth();
  if (!auth.ok) {
    return errorResult(method, auth.code, auth.message, { missingSecrets: auth.missingSecrets });
  }

  try {
    switch (method) {
      case 'metadata.search':
        return handleMetadataSearch(input, auth);
      case 'metadata.detail':
        return handleMetadataDetail(input, auth);
      case 'artwork.list':
        return handleArtworkList(input, auth);
      default:
        return errorResult(method, 'UNSUPPORTED_METHOD', 'Unsupported TMDB method "' + String(method) + '".');
    }
  } catch (err) {
    const code = err && err.code ? err.code : 'UPSTREAM_ERROR';
    const message = redactSecrets(err && err.message ? err.message : String(err), auth.secrets);
    return errorResult(method, code, message, err && err.status ? { status: err.status } : undefined);
  }
}
