// SPDX-License-Identifier: LGPL-3.0-or-later
// VeneraCat service plugin: Trakt (API v2)

const SERVICE_ID = 'service.trakt';
const API_BASE = 'https://api.trakt.tv';
const TRAKT_API_VERSION = '2';
const DEFAULT_USER_AGENT = 'VeneraCat/0.1.0 (https://github.com/laincat/VeneraCat-Sources)';
const DEFAULT_APP_VERSION = '0.1.0';
const DEFAULT_APP_DATE = '2026-11-25';

const SEARCH_TYPES = { movie: true, show: true, episode: true, person: true, list: true };
const LIST_TYPES = { movies: true, shows: true, seasons: true, episodes: true };
const WATCHLIST_SORTS = { rank: true, added: true, released: true, title: true };

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

function requireCredentials(requireAccessToken) {
  const clientRes = tryReadSecret('client_id');
  const tokenRes = tryReadSecret('access_token');
  const missing = [];
  let denied = false;

  if (!clientRes.ok) {
    missing.push('client_id');
    if (clientRes.denied) denied = true;
  }
  if (requireAccessToken && !tokenRes.ok) {
    missing.push('access_token');
    if (tokenRes.denied) denied = true;
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: denied ? 'SECRET_UNAVAILABLE' : 'MISSING_SECRET',
      message: (denied ? 'Host refused access to required Trakt secret(s): ' : 'Missing required Trakt secret(s): ') + missing.join(', ') + '.',
      missingSecrets: missing
    };
  }

  const secrets = [clientRes.value];
  if (tokenRes.ok) secrets.push(tokenRes.value);
  return {
    ok: true,
    clientId: clientRes.value,
    accessToken: tokenRes.ok ? tokenRes.value : null,
    secrets
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

function toPositiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

function makeHeaders(creds) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'trakt-api-version': TRAKT_API_VERSION,
    'trakt-api-key': creds.clientId,
    'User-Agent': safeStorageGet('user_agent') || DEFAULT_USER_AGENT
  };
  if (creds.accessToken) {
    headers.Authorization = 'Bearer ' + creds.accessToken;
  }
  return headers;
}

function requestTrakt(method, path, queryParams, body, creds) {
  const url = API_BASE + path + buildQuery(queryParams || {});
  const init = {
    method,
    headers: makeHeaders(creds)
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  let raw;
  try {
    raw = fetch(url, init);
  } catch (err) {
    const rawMsg = err && err.message ? String(err.message) : String(err);
    const wrapped = new Error(redactSecrets(rawMsg, creds.secrets));
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
      const err = new Error('Trakt API returned HTTP ' + status);
      err.code = status === 401 || status === 403 ? 'AUTH_ERROR' : 'HTTP_ERROR';
      err.status = status;
      throw err;
    }
  }

  if (!text || text.trim().length === 0) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const err = new Error('Invalid JSON response from Trakt API.');
    err.code = 'INVALID_UPSTREAM_JSON';
    throw err;
  }
}

function extractMediaEntity(entry) {
  if (!entry || typeof entry !== 'object') return { mediaType: 'unknown', entity: null };
  if (entry.movie && typeof entry.movie === 'object') return { mediaType: 'movie', entity: entry.movie };
  if (entry.episode && typeof entry.episode === 'object') return { mediaType: 'episode', entity: entry.episode };
  if (entry.season && typeof entry.season === 'object') return { mediaType: 'season', entity: entry.season };
  if (entry.show && typeof entry.show === 'object') return { mediaType: 'show', entity: entry.show };
  if (entry.person && typeof entry.person === 'object') return { mediaType: 'person', entity: entry.person };
  if (entry.list && typeof entry.list === 'object') return { mediaType: 'list', entity: entry.list };
  return { mediaType: entry.type || 'unknown', entity: null };
}

function normalizeSearchTypes(input) {
  if (input === undefined || input === null || input === '') return 'movie,show';
  const rawList = Array.isArray(input) ? input : String(input).split(',');
  const valid = [];
  const seen = {};
  for (let i = 0; i < rawList.length; i++) {
    const t = String(rawList[i]).trim().toLowerCase();
    if (!t) continue;
    if (!SEARCH_TYPES[t]) return null;
    if (!seen[t]) {
      seen[t] = true;
      valid.push(t);
    }
  }
  return valid.length > 0 ? valid.join(',') : null;
}

function handleAccountMe() {
  const creds = requireCredentials(true);
  if (!creds.ok) {
    return errorResult('account.me', creds.code, creds.message, { missingSecrets: creds.missingSecrets });
  }
  safeLog('info', 'trakt account.me -> GET /users/settings');
  const body = requestTrakt('GET', '/users/settings', null, undefined, creds) || {};
  const user = body.user && typeof body.user === 'object' ? body.user : {};
  const slug = user.ids && user.ids.slug ? user.ids.slug : (user.username || '');
  if (slug) {
    safeStorageSet('last_user_slug', slug);
  }
  return okResult('account.me', {
    username: user.username || '',
    slug,
    name: user.name || '',
    private: Boolean(user.private),
    vip: Boolean(user.vip),
    vipEp: Boolean(user.vip_ep),
    location: user.location || '',
    avatar: user.images && user.images.avatar ? user.images.avatar.full || '' : '',
    account: body.account || null,
    connections: body.connections || null
  });
}

function handleMetadataSearch(payload) {
  const creds = requireCredentials(false);
  if (!creds.ok) {
    return errorResult('metadata.search', creds.code, creds.message, { missingSecrets: creds.missingSecrets });
  }
  const query = typeof payload.query === 'string'
    ? payload.query.trim()
    : (typeof payload.keyword === 'string' ? payload.keyword.trim() : '');
  if (!query) {
    return errorResult('metadata.search', 'INVALID_PARAMS', 'Field "query" is required.');
  }
  const type = normalizeSearchTypes(payload.type);
  if (!type) {
    return errorResult('metadata.search', 'INVALID_PARAMS', 'Field "type" must contain valid Trakt types (movie, show, episode, person, list).');
  }
  const page = toPositiveInt(payload.page, 1);
  const limit = toPositiveInt(payload.limit, 20);
  const queryParams = { query, page, limit };
  if (typeof payload.extended === 'string' && payload.extended.trim()) {
    queryParams.extended = payload.extended.trim();
  }

  safeLog('info', 'trakt metadata.search -> GET /search/' + type);
  const list = requestTrakt('GET', '/search/' + type, queryParams, undefined, creds);
  const rows = Array.isArray(list) ? list : [];
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    const extracted = extractMediaEntity(row);
    const entity = extracted.entity || {};
    items.push({
      type: row.type || extracted.mediaType,
      score: typeof row.score === 'number' ? row.score : null,
      title: entity.title || entity.name || '',
      year: typeof entity.year === 'number' ? entity.year : null,
      ids: entity.ids || null,
      overview: entity.overview || '',
      runtime: typeof entity.runtime === 'number' ? entity.runtime : null,
      show: row.show || null
    });
  }
  return okResult('metadata.search', {
    query,
    type,
    page,
    limit,
    items
  });
}

function handleWatchlistList(payload) {
  const creds = requireCredentials(true);
  if (!creds.ok) {
    return errorResult('watchlist.list', creds.code, creds.message, { missingSecrets: creds.missingSecrets });
  }
  let path = '/sync/watchlist';
  let type = null;
  if (payload.type !== undefined && payload.type !== null && payload.type !== '') {
    type = String(payload.type).trim().toLowerCase();
    if (!LIST_TYPES[type]) {
      return errorResult('watchlist.list', 'INVALID_PARAMS', 'Field "type" must be one of movies, shows, seasons, episodes.');
    }
    path += '/' + type;
    if (payload.sort !== undefined && payload.sort !== null && payload.sort !== '') {
      const sort = String(payload.sort).trim().toLowerCase();
      if (!WATCHLIST_SORTS[sort]) {
        return errorResult('watchlist.list', 'INVALID_PARAMS', 'Field "sort" must be one of rank, added, released, title.');
      }
      path += '/' + sort;
    }
  }
  const page = toPositiveInt(payload.page, 1);
  const limit = toPositiveInt(payload.limit, 20);
  const queryParams = { page, limit };
  if (typeof payload.extended === 'string' && payload.extended.trim()) {
    queryParams.extended = payload.extended.trim();
  }

  safeLog('info', 'trakt watchlist.list -> GET ' + path);
  const list = requestTrakt('GET', path, queryParams, undefined, creds);
  const rows = Array.isArray(list) ? list : [];
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    const extracted = extractMediaEntity(row);
    const entity = extracted.entity || {};
    items.push({
      id: row.id,
      rank: typeof row.rank === 'number' ? row.rank : null,
      listedAt: row.listed_at || '',
      type: row.type || extracted.mediaType,
      title: entity.title || '',
      year: typeof entity.year === 'number' ? entity.year : null,
      ids: entity.ids || null,
      notes: row.notes || '',
      show: row.show || null
    });
  }
  return okResult('watchlist.list', {
    type: type || 'all',
    page,
    limit,
    items
  });
}

function handleHistoryList(payload) {
  const creds = requireCredentials(true);
  if (!creds.ok) {
    return errorResult('history.list', creds.code, creds.message, { missingSecrets: creds.missingSecrets });
  }
  let path = '/sync/history';
  let type = null;
  if (payload.type !== undefined && payload.type !== null && payload.type !== '') {
    type = String(payload.type).trim().toLowerCase();
    if (!LIST_TYPES[type]) {
      return errorResult('history.list', 'INVALID_PARAMS', 'Field "type" must be one of movies, shows, seasons, episodes.');
    }
    path += '/' + type;
    if (payload.id !== undefined && payload.id !== null && payload.id !== '') {
      path += '/' + encodeURIComponent(String(payload.id));
    }
  }
  const page = toPositiveInt(payload.page, 1);
  const limit = toPositiveInt(payload.limit, 20);
  const queryParams = {
    page,
    limit,
    start_at: typeof payload.startAt === 'string' ? payload.startAt : (typeof payload.start_at === 'string' ? payload.start_at : undefined),
    end_at: typeof payload.endAt === 'string' ? payload.endAt : (typeof payload.end_at === 'string' ? payload.end_at : undefined),
    extended: typeof payload.extended === 'string' && payload.extended.trim() ? payload.extended.trim() : undefined
  };

  safeLog('info', 'trakt history.list -> GET ' + path);
  const list = requestTrakt('GET', path, queryParams, undefined, creds);
  const rows = Array.isArray(list) ? list : [];
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    const extracted = extractMediaEntity(row);
    const entity = extracted.entity || {};
    items.push({
      id: row.id,
      watchedAt: row.watched_at || '',
      action: row.action || '',
      type: row.type || extracted.mediaType,
      title: entity.title || '',
      year: typeof entity.year === 'number' ? entity.year : null,
      ids: entity.ids || null,
      episode: row.episode || null,
      show: row.show || null
    });
  }
  return okResult('history.list', {
    type: type || 'all',
    page,
    limit,
    items
  });
}

function handleScrobble(action, payload) {
  const method = 'scrobble.' + action;
  const creds = requireCredentials(true);
  if (!creds.ok) {
    return errorResult(method, creds.code, creds.message, { missingSecrets: creds.missingSecrets });
  }
  const hasMovie = payload.movie && typeof payload.movie === 'object' && !Array.isArray(payload.movie);
  const hasEpisode = payload.episode && typeof payload.episode === 'object' && !Array.isArray(payload.episode);
  if (!hasMovie && !hasEpisode) {
    return errorResult(method, 'INVALID_PARAMS', 'Scrobble requires either a "movie" or "episode" object.');
  }
  const progress = Number(payload.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    return errorResult(method, 'INVALID_PARAMS', 'Field "progress" must be a finite number between 0 and 100.');
  }

  const body = {
    progress,
    app_version: typeof payload.appVersion === 'string' && payload.appVersion.trim() ? payload.appVersion.trim() : DEFAULT_APP_VERSION,
    app_date: typeof payload.appDate === 'string' && payload.appDate.trim() ? payload.appDate.trim() : DEFAULT_APP_DATE
  };
  if (hasMovie) body.movie = payload.movie;
  if (hasEpisode) body.episode = payload.episode;
  if (payload.show && typeof payload.show === 'object' && !Array.isArray(payload.show)) {
    body.show = payload.show;
  }

  const path = '/scrobble/' + action;
  safeLog('info', 'trakt ' + method + ' -> POST ' + path);
  const res = requestTrakt('POST', path, null, body, creds) || {};
  const result = {
    id: res.id || 0,
    action: res.action || action,
    progress: typeof res.progress === 'number' ? res.progress : progress,
    sharing: res.sharing || null,
    movie: res.movie || (hasMovie ? payload.movie : null),
    show: res.show || (body.show || null),
    episode: res.episode || (hasEpisode ? payload.episode : null)
  };
  safeStorageSet('last_scrobble', JSON.stringify({
    action: result.action,
    progress: result.progress,
    id: result.id
  }));
  return okResult(method, result);
}

export function describe() {
  return {
    methods: [
      { name: 'account.me', title: '账号信息 / Account Profile' },
      { name: 'metadata.search', title: '条目搜索 / Search Media' },
      { name: 'watchlist.list', title: '片单列表 / Watchlist' },
      { name: 'history.list', title: '观看历史 / Watch History' },
      { name: 'scrobble.start', title: '开始播放上报 / Start Scrobble' },
      { name: 'scrobble.stop', title: '结束播放上报 / Stop Scrobble' }
    ]
  };
}

export function handle(method, payload) {
  const parsed = parsePayload(payload);
  if (!parsed.ok) {
    return errorResult(method, 'INVALID_PAYLOAD', parsed.message);
  }
  const input = parsed.value;
  try {
    switch (method) {
      case 'account.me':
        return handleAccountMe();
      case 'metadata.search':
        return handleMetadataSearch(input);
      case 'watchlist.list':
        return handleWatchlistList(input);
      case 'history.list':
        return handleHistoryList(input);
      case 'scrobble.start':
        return handleScrobble('start', input);
      case 'scrobble.stop':
        return handleScrobble('stop', input);
      default:
        return errorResult(method, 'UNSUPPORTED_METHOD', 'Unsupported Trakt method "' + String(method) + '".');
    }
  } catch (err) {
    const clientRes = tryReadSecret('client_id');
    const tokenRes = tryReadSecret('access_token');
    const secrets = [];
    if (clientRes.ok) secrets.push(clientRes.value);
    if (tokenRes.ok) secrets.push(tokenRes.value);
    const code = err && err.code ? err.code : 'UPSTREAM_ERROR';
    const message = redactSecrets(err && err.message ? err.message : String(err), secrets);
    return errorResult(method, code, message, err && err.status ? { status: err.status } : undefined);
  }
}
