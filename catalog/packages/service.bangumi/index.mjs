// SPDX-License-Identifier: LGPL-3.0-or-later
// VeneraCat service plugin: Bangumi (API v0 + legacy search fallback)

const SERVICE_ID = 'service.bangumi';
const API_BASE = 'https://api.bgm.tv';
const DEFAULT_USER_AGENT = 'VeneraCat/0.1.0 (https://github.com/laincat/VeneraCat-Sources)';

const SUBJECT_TYPE_MAP = {
  book: 1,
  anime: 2,
  music: 3,
  game: 4,
  real: 6
};

const COLLECTION_TYPE_MAP = {
  wish: 1,
  collect: 2,
  doing: 3,
  on_hold: 4,
  dropped: 5
};

const EPISODE_COLLECTION_TYPE_MAP = {
  unwatched: 0,
  remove: 0,
  wish: 1,
  done: 2,
  watched: 2,
  dropped: 3
};

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
    // Logging must never break service execution.
  }
}

function safeStorageGet(key) {
  try {
    if (typeof storageGet === 'function') {
      const value = storageGet(key);
      return typeof value === 'string' && value.length > 0 ? value : null;
    }
  } catch (_) {
    // Storage permission may be withheld; degrade gracefully.
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
    // Storage permission may be withheld; degrade gracefully.
  }
  return false;
}

function redactSecrets(text, secretValues) {
  let out = String(text || '');
  if (!Array.isArray(secretValues)) return out;
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
  return out.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}

function readSecret(key) {
  try {
    const raw = secret(key);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return { ok: true, value: raw.trim() };
    }
    return { ok: false, code: 'MISSING_SECRET', message: 'Required secret "' + key + '" is not configured.' };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    const lower = msg.toLowerCase();
    if (lower.indexOf('permission') >= 0 || lower.indexOf('no account values') >= 0) {
      return { ok: false, code: 'SECRET_UNAVAILABLE', message: 'Host refused access to secret "' + key + '".' };
    }
    return { ok: false, code: 'MISSING_SECRET', message: 'Required secret "' + key + '" is not configured.' };
  }
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
      if (parsed === null || parsed === undefined) {
        return { ok: true, value: {} };
      }
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

function toNonNegativeInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

function normalizeSubjectTypes(input) {
  if (input === undefined || input === null || input === '') return null;
  const arr = Array.isArray(input) ? input : [input];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === 'number' && Number.isInteger(item)) {
      out.push(item);
    } else if (typeof item === 'string') {
      const lower = item.trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(SUBJECT_TYPE_MAP, lower)) {
        out.push(SUBJECT_TYPE_MAP[lower]);
      } else {
        const parsed = Number(lower);
        if (Number.isInteger(parsed) && parsed > 0) out.push(parsed);
      }
    }
  }
  return out.length > 0 ? out : null;
}

function normalizeCollectionType(input) {
  if (input === undefined || input === null) return null;
  if (typeof input === 'number' && Number.isInteger(input) && input >= 1 && input <= 5) {
    return input;
  }
  if (typeof input === 'string') {
    const lower = input.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(COLLECTION_TYPE_MAP, lower)) {
      return COLLECTION_TYPE_MAP[lower];
    }
    const n = Number(lower);
    if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
  }
  return null;
}

function normalizeEpisodeType(input) {
  if (input === undefined || input === null) return null;
  if (typeof input === 'number' && Number.isInteger(input) && input >= 0 && input <= 3) {
    return input;
  }
  if (typeof input === 'string') {
    const lower = input.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(EPISODE_COLLECTION_TYPE_MAP, lower)) {
      return EPISODE_COLLECTION_TYPE_MAP[lower];
    }
    const n = Number(lower);
    if (Number.isInteger(n) && n >= 0 && n <= 3) return n;
  }
  return null;
}

function getUserAgent(payload) {
  if (payload && typeof payload.userAgent === 'string' && payload.userAgent.trim().length > 0) {
    return payload.userAgent.trim();
  }
  return safeStorageGet('user_agent') || DEFAULT_USER_AGENT;
}

function makeHeaders(token, userAgent, hasBody) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': userAgent
  };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }
  return headers;
}

function requestJson(url, options, secretValues) {
  const init = {
    method: (options && options.method) || 'GET',
    headers: (options && options.headers) || {}
  };
  if (options && options.body !== undefined) {
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  let raw;
  try {
    raw = fetch(url, init);
  } catch (err) {
    const rawMsg = err && err.message ? String(err.message) : String(err);
    const wrapped = new Error(redactSecrets(rawMsg, secretValues));
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
      const err = new Error('Bangumi API returned HTTP ' + status);
      err.code = status === 401 || status === 403 ? 'AUTH_ERROR' : 'HTTP_ERROR';
      err.status = status;
      throw err;
    }
  }

  if (!text || text.trim().length === 0) {
    return { status, data: null };
  }
  try {
    return { status, data: JSON.parse(text) };
  } catch (_) {
    const err = new Error('Invalid JSON response from Bangumi API.');
    err.code = 'INVALID_UPSTREAM_JSON';
    throw err;
  }
}

function normalizeSubjectItem(item) {
  if (!item || typeof item !== 'object') return null;
  const rating = item.rating && typeof item.rating === 'object' ? item.rating : null;
  return {
    id: item.id,
    type: item.type,
    name: item.name || '',
    nameCn: item.name_cn || '',
    summary: item.summary || '',
    date: item.date || item.air_date || '',
    score: rating && typeof rating.score === 'number' ? rating.score : (typeof item.score === 'number' ? item.score : null),
    rank: rating && typeof rating.rank === 'number' ? rating.rank : (typeof item.rank === 'number' ? item.rank : null),
    eps: typeof item.eps === 'number' ? item.eps : null,
    images: item.images || null,
    url: item.url || (item.id ? 'https://bgm.tv/subject/' + item.id : '')
  };
}

function normalizeCollectionItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    subjectId: item.subject_id,
    subjectType: item.subject_type,
    type: item.type,
    rate: item.rate,
    epStatus: item.ep_status,
    volStatus: item.vol_status,
    comment: item.comment || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    private: Boolean(item.private),
    updatedAt: item.updated_at || '',
    subject: item.subject ? normalizeSubjectItem(item.subject) : null
  };
}

function handleAccountMe(payload) {
  const tokenRes = readSecret('access_token');
  if (!tokenRes.ok) {
    return errorResult('account.me', tokenRes.code, tokenRes.message, { missingSecrets: ['access_token'] });
  }
  const token = tokenRes.value;
  const ua = getUserAgent(payload);
  safeLog('info', 'bangumi account.me -> GET /v0/me');
  const res = requestJson(API_BASE + '/v0/me', {
    method: 'GET',
    headers: makeHeaders(token, ua, false)
  }, [token]);
  const user = res.data || {};
  if (typeof user.username === 'string' && user.username.length > 0) {
    safeStorageSet('last_username', user.username);
  }
  return okResult('account.me', {
    id: user.id,
    username: user.username || '',
    nickname: user.nickname || '',
    sign: user.sign || '',
    userGroup: user.user_group,
    avatar: user.avatar || null,
    url: user.url || (user.username ? 'https://bgm.tv/user/' + user.username : '')
  });
}

function handleMetadataSearch(payload) {
  const keyword = typeof payload.keyword === 'string'
    ? payload.keyword.trim()
    : (typeof payload.query === 'string' ? payload.query.trim() : '');
  if (!keyword) {
    return errorResult('metadata.search', 'INVALID_PARAMS', 'Field "keyword" (or "query") is required.');
  }
  const limit = toNonNegativeInt(payload.limit, 20);
  const offset = toNonNegativeInt(payload.offset, 0);
  const sort = typeof payload.sort === 'string' && payload.sort.trim() ? payload.sort.trim() : 'match';
  const types = normalizeSubjectTypes(payload.type);
  const ua = getUserAgent(payload);
  const tokenRes = readSecret('access_token');
  const token = tokenRes.ok ? tokenRes.value : null;
  const secrets = token ? [token] : [];

  const runLegacy = function (reason) {
    const queryParams = {
      responseGroup: payload.responseGroup || 'large',
      max_results: limit,
      start: offset
    };
    if (types && types.length === 1) {
      queryParams.type = types[0];
    }
    const legacyUrl = API_BASE + '/search/subject/' + encodeURIComponent(keyword) + buildQuery(queryParams);
    safeLog('info', 'bangumi metadata.search fallback -> GET /search/subject');
    const legacyRes = requestJson(legacyUrl, {
      method: 'GET',
      headers: makeHeaders(token, ua, false)
    }, secrets);
    const body = legacyRes.data || {};
    const list = Array.isArray(body.list) ? body.list : [];
    const items = [];
    for (let i = 0; i < list.length; i++) {
      const normalized = normalizeSubjectItem(list[i]);
      if (normalized) items.push(normalized);
    }
    return okResult('metadata.search', {
      keyword,
      items,
      total: typeof body.results === 'number' ? body.results : items.length,
      limit,
      offset,
      fallbackUsed: true,
      fallbackReason: reason
    });
  };

  if (payload.legacy === true) {
    return runLegacy('requested_legacy');
  }

  const v0Url = API_BASE + '/v0/search/subjects' + buildQuery({ limit, offset });
  const v0Body = { keyword, sort };
  if (payload.filter && typeof payload.filter === 'object' && !Array.isArray(payload.filter)) {
    v0Body.filter = payload.filter;
  }
  if (types) {
    if (!v0Body.filter) v0Body.filter = {};
    v0Body.filter.type = types;
  }

  try {
    safeLog('info', 'bangumi metadata.search -> POST /v0/search/subjects');
    const v0Res = requestJson(v0Url, {
      method: 'POST',
      headers: makeHeaders(token, ua, true),
      body: v0Body
    }, secrets);
    const body = v0Res.data;
    if (body && Array.isArray(body.data)) {
      const items = [];
      for (let i = 0; i < body.data.length; i++) {
        const normalized = normalizeSubjectItem(body.data[i]);
        if (normalized) items.push(normalized);
      }
      return okResult('metadata.search', {
        keyword,
        items,
        total: typeof body.total === 'number' ? body.total : items.length,
        limit: typeof body.limit === 'number' ? body.limit : limit,
        offset: typeof body.offset === 'number' ? body.offset : offset,
        fallbackUsed: false
      });
    }
    return runLegacy('v0_unexpected_shape');
  } catch (err) {
    const reason = err && err.code ? err.code : 'v0_failed';
    safeLog('warn', 'bangumi v0 search failed (' + reason + '); retrying legacy endpoint');
    return runLegacy(reason);
  }
}

function handleMetadataDetail(payload) {
  const subjectId = toPositiveInt(payload.subjectId !== undefined ? payload.subjectId : payload.id);
  if (!subjectId) {
    return errorResult('metadata.detail', 'INVALID_PARAMS', 'Positive integer "subjectId" (or "id") is required.');
  }
  const ua = getUserAgent(payload);
  const tokenRes = readSecret('access_token');
  const token = tokenRes.ok ? tokenRes.value : null;
  const secrets = token ? [token] : [];

  safeLog('info', 'bangumi metadata.detail -> GET /v0/subjects/' + subjectId);
  const res = requestJson(API_BASE + '/v0/subjects/' + subjectId, {
    method: 'GET',
    headers: makeHeaders(token, ua, false)
  }, secrets);
  const s = res.data || {};
  const detail = {
    id: s.id || subjectId,
    type: s.type,
    name: s.name || '',
    nameCn: s.name_cn || '',
    summary: s.summary || '',
    date: s.date || '',
    platform: s.platform || '',
    eps: typeof s.eps === 'number' ? s.eps : null,
    totalEpisodes: typeof s.total_episodes === 'number' ? s.total_episodes : null,
    volumes: typeof s.volumes === 'number' ? s.volumes : null,
    rating: s.rating || null,
    tags: Array.isArray(s.tags) ? s.tags : [],
    infobox: Array.isArray(s.infobox) ? s.infobox : [],
    images: s.images || null,
    collection: s.collection || null,
    url: 'https://bgm.tv/subject/' + (s.id || subjectId)
  };

  if (payload.includeEpisodes === true) {
    const epQuery = buildQuery({
      subject_id: subjectId,
      type: payload.episodeType,
      limit: toNonNegativeInt(payload.episodeLimit, 100),
      offset: toNonNegativeInt(payload.episodeOffset, 0)
    });
    safeLog('info', 'bangumi metadata.detail -> GET /v0/episodes');
    const epRes = requestJson(API_BASE + '/v0/episodes' + epQuery, {
      method: 'GET',
      headers: makeHeaders(token, ua, false)
    }, secrets);
    const epBody = epRes.data || {};
    const epList = Array.isArray(epBody.data) ? epBody.data : [];
    detail.episodes = [];
    for (let i = 0; i < epList.length; i++) {
      const ep = epList[i];
      if (!ep || typeof ep !== 'object') continue;
      detail.episodes.push({
        id: ep.id,
        type: ep.type,
        sort: ep.sort,
        ep: ep.ep,
        name: ep.name || '',
        nameCn: ep.name_cn || '',
        airdate: ep.airdate || '',
        duration: ep.duration || ''
      });
    }
  }

  return okResult('metadata.detail', detail);
}

function handleCollectionGet(payload) {
  const ua = getUserAgent(payload);
  const tokenRes = readSecret('access_token');
  const token = tokenRes.ok ? tokenRes.value : null;
  const secrets = token ? [token] : [];

  let username = typeof payload.username === 'string' && payload.username.trim()
    ? payload.username.trim()
    : safeStorageGet('last_username');

  if (!username) {
    if (!tokenRes.ok) {
      return errorResult('collection.get', tokenRes.code, tokenRes.message, { missingSecrets: ['access_token'] });
    }
    safeLog('info', 'bangumi collection.get resolving username -> GET /v0/me');
    const meRes = requestJson(API_BASE + '/v0/me', {
      method: 'GET',
      headers: makeHeaders(token, ua, false)
    }, secrets);
    username = meRes.data && typeof meRes.data.username === 'string' ? meRes.data.username.trim() : '';
    if (!username) {
      return errorResult('collection.get', 'UPSTREAM_ERROR', 'Unable to determine Bangumi username from /v0/me.');
    }
    safeStorageSet('last_username', username);
  }

  const rawSubjectId = payload.subjectId !== undefined ? payload.subjectId : payload.subject_id;
  if (rawSubjectId !== undefined && rawSubjectId !== null && rawSubjectId !== '') {
    const subjectId = toPositiveInt(rawSubjectId);
    if (!subjectId) {
      return errorResult('collection.get', 'INVALID_PARAMS', 'Field "subjectId" must be a positive integer.');
    }
    const url = API_BASE + '/v0/users/' + encodeURIComponent(username) + '/collections/' + subjectId;
    safeLog('info', 'bangumi collection.get -> GET /v0/users/' + username + '/collections/' + subjectId);
    const res = requestJson(url, {
      method: 'GET',
      headers: makeHeaders(token, ua, false)
    }, secrets);
    return okResult('collection.get', {
      username,
      item: normalizeCollectionItem(res.data)
    });
  }

  const subjectTypes = normalizeSubjectTypes(payload.subjectType !== undefined ? payload.subjectType : payload.subject_type);
  const collectionType = normalizeCollectionType(payload.type);
  const limit = toNonNegativeInt(payload.limit, 30);
  const offset = toNonNegativeInt(payload.offset, 0);
  const query = buildQuery({
    subject_type: subjectTypes ? subjectTypes[0] : undefined,
    type: collectionType !== null ? collectionType : undefined,
    limit,
    offset
  });
  const url = API_BASE + '/v0/users/' + encodeURIComponent(username) + '/collections' + query;
  safeLog('info', 'bangumi collection.get -> GET /v0/users/' + username + '/collections');
  const res = requestJson(url, {
    method: 'GET',
    headers: makeHeaders(token, ua, false)
  }, secrets);
  const body = res.data || {};
  const list = Array.isArray(body.data) ? body.data : [];
  const items = [];
  for (let i = 0; i < list.length; i++) {
    const normalized = normalizeCollectionItem(list[i]);
    if (normalized) items.push(normalized);
  }
  return okResult('collection.get', {
    username,
    items,
    total: typeof body.total === 'number' ? body.total : items.length,
    limit: typeof body.limit === 'number' ? body.limit : limit,
    offset: typeof body.offset === 'number' ? body.offset : offset
  });
}

function handleCollectionUpdate(payload) {
  const tokenRes = readSecret('access_token');
  if (!tokenRes.ok) {
    return errorResult('collection.update', tokenRes.code, tokenRes.message, { missingSecrets: ['access_token'] });
  }
  const token = tokenRes.value;
  const subjectId = toPositiveInt(payload.subjectId !== undefined ? payload.subjectId : payload.subject_id);
  if (!subjectId) {
    return errorResult('collection.update', 'INVALID_PARAMS', 'Positive integer "subjectId" is required.');
  }

  const body = {};
  if (payload.type !== undefined) {
    const t = normalizeCollectionType(payload.type);
    if (t === null) {
      return errorResult('collection.update', 'INVALID_PARAMS', 'Field "type" must be 1..5 or wish/collect/doing/on_hold/dropped.');
    }
    body.type = t;
  }
  if (payload.rate !== undefined) {
    const rate = Number(payload.rate);
    if (!Number.isInteger(rate) || rate < 0 || rate > 10) {
      return errorResult('collection.update', 'INVALID_PARAMS', 'Field "rate" must be an integer between 0 and 10.');
    }
    body.rate = rate;
  }
  const epStatus = payload.epStatus !== undefined ? payload.epStatus : payload.ep_status;
  if (epStatus !== undefined) {
    const ep = Number(epStatus);
    if (!Number.isInteger(ep) || ep < 0) {
      return errorResult('collection.update', 'INVALID_PARAMS', 'Field "epStatus" must be a non-negative integer.');
    }
    body.ep_status = ep;
  }
  const volStatus = payload.volStatus !== undefined ? payload.volStatus : payload.vol_status;
  if (volStatus !== undefined) {
    const vol = Number(volStatus);
    if (!Number.isInteger(vol) || vol < 0) {
      return errorResult('collection.update', 'INVALID_PARAMS', 'Field "volStatus" must be a non-negative integer.');
    }
    body.vol_status = vol;
  }
  if (typeof payload.comment === 'string') body.comment = payload.comment;
  if (typeof payload.private === 'boolean') body.private = payload.private;
  if (Array.isArray(payload.tags)) body.tags = payload.tags.map(String);

  if (Object.keys(body).length === 0) {
    return errorResult('collection.update', 'INVALID_PARAMS', 'At least one collection field (type, rate, epStatus, volStatus, comment, private, tags) is required.');
  }

  const ua = getUserAgent(payload);
  const url = API_BASE + '/v0/users/-/collections/' + subjectId;
  safeLog('info', 'bangumi collection.update -> POST /v0/users/-/collections/' + subjectId);
  requestJson(url, {
    method: 'POST',
    headers: makeHeaders(token, ua, true),
    body
  }, [token]);

  safeStorageSet('collection:' + subjectId, JSON.stringify({ subjectId, payload: body }));
  return okResult('collection.update', {
    subjectId,
    updated: true,
    payload: body
  });
}

function handleEpisodeUpdate(payload) {
  const tokenRes = readSecret('access_token');
  if (!tokenRes.ok) {
    return errorResult('episode.update', tokenRes.code, tokenRes.message, { missingSecrets: ['access_token'] });
  }
  const token = tokenRes.value;
  const type = normalizeEpisodeType(payload.type);
  if (type === null) {
    return errorResult('episode.update', 'INVALID_PARAMS', 'Field "type" must be 0..3 or unwatched/wish/done/dropped.');
  }
  const ua = getUserAgent(payload);

  const rawEpisodeIds = payload.episodeIds !== undefined ? payload.episodeIds : payload.episode_ids;
  if (Array.isArray(rawEpisodeIds) && rawEpisodeIds.length > 0) {
    const subjectId = toPositiveInt(payload.subjectId !== undefined ? payload.subjectId : payload.subject_id);
    if (!subjectId) {
      return errorResult('episode.update', 'INVALID_PARAMS', 'Batch episode update requires positive integer "subjectId".');
    }
    const ids = [];
    for (let i = 0; i < rawEpisodeIds.length; i++) {
      const id = toPositiveInt(rawEpisodeIds[i]);
      if (!id) {
        return errorResult('episode.update', 'INVALID_PARAMS', 'All "episodeIds" entries must be positive integers.');
      }
      ids.push(id);
    }
    const body = { episode_id: ids, type };
    const url = API_BASE + '/v0/users/-/collections/' + subjectId + '/episodes';
    safeLog('info', 'bangumi episode.update (batch) -> PATCH /v0/users/-/collections/' + subjectId + '/episodes');
    requestJson(url, {
      method: 'PATCH',
      headers: makeHeaders(token, ua, true),
      body
    }, [token]);
    safeStorageSet('episode:batch:' + subjectId, JSON.stringify({ subjectId, episodeIds: ids, type }));
    return okResult('episode.update', {
      mode: 'batch',
      subjectId,
      episodeIds: ids,
      type,
      updated: true
    });
  }

  const episodeId = toPositiveInt(payload.episodeId !== undefined ? payload.episodeId : payload.episode_id);
  if (!episodeId) {
    return errorResult('episode.update', 'INVALID_PARAMS', 'Positive integer "episodeId" (or "subjectId" + "episodeIds") is required.');
  }
  const body = { type };
  const url = API_BASE + '/v0/users/-/collections/-/episodes/' + episodeId;
  safeLog('info', 'bangumi episode.update -> PUT /v0/users/-/collections/-/episodes/' + episodeId);
  requestJson(url, {
    method: 'PUT',
    headers: makeHeaders(token, ua, true),
    body
  }, [token]);

  safeStorageSet('episode:' + episodeId, JSON.stringify({ episodeId, type }));
  return okResult('episode.update', {
    mode: 'single',
    episodeId,
    type,
    updated: true
  });
}

export function describe() {
  return {
    methods: [
      { name: 'account.me', title: '账号自检 / Account Profile' },
      { name: 'metadata.search', title: '条目搜索 / Search Subjects' },
      { name: 'metadata.detail', title: '条目详情 / Subject Detail' },
      { name: 'collection.get', title: '读取收藏 / Get Collection' },
      { name: 'collection.update', title: '更新收藏 / Update Collection' },
      { name: 'episode.update', title: '更新章节进度 / Update Episode Progress' }
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
        return handleAccountMe(input);
      case 'metadata.search':
        return handleMetadataSearch(input);
      case 'metadata.detail':
        return handleMetadataDetail(input);
      case 'collection.get':
        return handleCollectionGet(input);
      case 'collection.update':
        return handleCollectionUpdate(input);
      case 'episode.update':
        return handleEpisodeUpdate(input);
      default:
        return errorResult(method, 'UNSUPPORTED_METHOD', 'Unsupported Bangumi method "' + String(method) + '".');
    }
  } catch (err) {
    const tokenRes = readSecret('access_token');
    const secrets = tokenRes.ok ? [tokenRes.value] : [];
    const code = err && err.code ? err.code : 'UPSTREAM_ERROR';
    const message = redactSecrets(err && err.message ? err.message : String(err), secrets);
    return errorResult(method, code, message, err && err.status ? { status: err.status } : undefined);
  }
}
