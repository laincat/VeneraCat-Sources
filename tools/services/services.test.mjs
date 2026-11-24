import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import * as bangumi from '../../catalog/packages/service.bangumi/index.mjs';
import * as tmdb from '../../catalog/packages/service.tmdb/index.mjs';
import * as trakt from '../../catalog/packages/service.trakt/index.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HOST_GLOBALS = ['fetch', 'storageGet', 'storageSet', 'secret', 'log'];

function withMockHost(options, fn) {
  const saved = {};
  for (const name of HOST_GLOBALS) {
    saved[name] = Object.prototype.hasOwnProperty.call(globalThis, name)
      ? globalThis[name]
      : undefined;
  }

  const calls = [];
  const logs = [];
  const store = new Map(Object.entries(options.storage || {}));
  const secrets = options.secrets || {};

  globalThis.fetch = (url, init) => {
    const req = {
      url,
      method: init?.method || 'GET',
      headers: init?.headers || {},
      body: init?.body
    };
    calls.push(req);
    if (typeof options.fetch !== 'function') {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return options.fetch(req);
  };

  globalThis.storageGet = key => {
    if (options.denyStorage) throw new Error('service: host did not grant the "storage" permission');
    return store.has(key) ? store.get(key) : null;
  };

  globalThis.storageSet = (key, value) => {
    if (options.denyStorage) throw new Error('service: host did not grant the "storage" permission');
    store.set(String(key), String(value));
  };

  globalThis.secret = key => {
    if (options.denySecrets) throw new Error('service: host did not grant the "secrets" permission');
    if (typeof secrets === 'function') return secrets(key);
    return Object.prototype.hasOwnProperty.call(secrets, key) ? secrets[key] : '';
  };

  globalThis.log = (level, message) => {
    logs.push({level, message});
  };

  try {
    return fn({calls, logs, store});
  } finally {
    for (const name of HOST_GLOBALS) {
      if (saved[name] === undefined) {
        delete globalThis[name];
      } else {
        globalThis[name] = saved[name];
      }
    }
  }
}

test('service manifests and built catalog artifacts follow Core contract', () => {
  const catalog = JSON.parse(readFileSync(resolve(ROOT, 'catalog/source.json'), 'utf8'));
  const built = JSON.parse(readFileSync(resolve(ROOT, 'build/source.json'), 'utf8'));
  const allowedKeys = new Set(['id', 'name', 'version', 'kind', 'entry', 'permissions']);
  const knownPerms = new Set(['network', 'storage', 'secrets']);

  for (const id of ['service.bangumi', 'service.tmdb', 'service.trakt']) {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, `catalog/packages/${id}/service.json`), 'utf8'));
    for (const key of Object.keys(manifest)) {
      assert.ok(allowedKeys.has(key), `${id} service.json has unexpected key ${key}`);
    }
    assert.equal(manifest.id, id);
    assert.equal(manifest.kind, 'service.js');
    assert.equal(manifest.entry, 'index.mjs');
    assert.deepEqual(new Set(manifest.permissions).size, manifest.permissions.length);
    for (const p of manifest.permissions) {
      assert.ok(knownPerms.has(p), `${id} unknown permission ${p}`);
    }

    const catEntry = catalog.entries.find(e => e.id === id);
    assert.ok(catEntry, `${id} missing in catalog/source.json`);
    assert.equal(catEntry.status, 'experimental');
    assert.equal(catEntry.license, 'LGPL-3.0-or-later');
    assert.equal(catEntry.verification.level, 'fixture-verified');

    const builtEntry = built.entries.find(e => e.id === id);
    assert.ok(builtEntry?.artifact, `${id} missing artifact in build/source.json`);
    assert.ok(builtEntry.artifact.url.endsWith('.zip'));
    const zipBytes = readFileSync(resolve(ROOT, 'build', builtEntry.artifact.url));
    assert.equal(zipBytes.length, builtEntry.artifact.bytes);
    const digest = createHash('sha256').update(zipBytes).digest('hex');
    assert.equal(digest, builtEntry.artifact.sha256);
    // PKZIP local file header signature
    assert.equal(zipBytes.readUInt32LE(0), 0x04034b50);
  }
});

test('service.bangumi supports all methods, User-Agent, legacy search fallback, and secret redaction', () => {
  const desc = bangumi.describe();
  assert.deepEqual(
    desc.methods.map(m => m.name),
    ['account.me', 'metadata.search', 'metadata.detail', 'collection.get', 'collection.update', 'episode.update']
  );

  // Missing secret returns structured error without hitting network
  withMockHost({secrets: {}}, ({calls}) => {
    const res = bangumi.handle('account.me', '{}');
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'MISSING_SECRET');
    assert.deepEqual(res.error.missingSecrets, ['access_token']);
    assert.equal(calls.length, 0);
  });

  // account.me + collection.get + collection.update + episode.update (single & batch)
  const token = 'bgm-pat-secret-9981';
  withMockHost({
    secrets: {access_token: token},
    fetch: req => {
      assert.ok(req.headers['User-Agent']?.includes('VeneraCat/'), 'Bangumi must send User-Agent');
      if (req.url === 'https://api.bgm.tv/v0/me') {
        assert.equal(req.method, 'GET');
        assert.equal(req.headers.Authorization, `Bearer ${token}`);
        return JSON.stringify({id: 42, username: 'laincat', nickname: 'Lain', user_group: 10});
      }
      if (req.url === 'https://api.bgm.tv/v0/subjects/400602') {
        return JSON.stringify({id: 400602, type: 2, name: '葬送のフリーレン', name_cn: '葬送的芙莉莲', eps: 28, total_episodes: 28});
      }
      if (req.url.startsWith('https://api.bgm.tv/v0/episodes?subject_id=400602')) {
        return JSON.stringify({data: [{id: 12001, type: 0, sort: 1, ep: 1, name: '冒険の終わり', name_cn: '冒险的终点'}]});
      }
      if (req.url === 'https://api.bgm.tv/v0/users/laincat/collections/400602') {
        return JSON.stringify({subject_id: 400602, subject_type: 2, type: 3, rate: 9, ep_status: 12, vol_status: 0, tags: ['anime']});
      }
      if (req.url === 'https://api.bgm.tv/v0/users/-/collections/400602') {
        assert.equal(req.method, 'POST');
        const body = JSON.parse(req.body);
        assert.equal(body.type, 3);
        assert.equal(body.ep_status, 13);
        assert.equal(body.rate, 9);
        return '';
      }
      if (req.url === 'https://api.bgm.tv/v0/users/-/collections/-/episodes/12001') {
        assert.equal(req.method, 'PUT');
        assert.deepEqual(JSON.parse(req.body), {type: 2});
        return '';
      }
      if (req.url === 'https://api.bgm.tv/v0/users/-/collections/400602/episodes') {
        assert.equal(req.method, 'PATCH');
        assert.deepEqual(JSON.parse(req.body), {episode_id: [12001, 12002], type: 2});
        return '';
      }
      throw new Error(`unexpected bangumi url: ${req.url}`);
    }
  }, ({store, logs}) => {
    const me = bangumi.handle('account.me', '{}');
    assert.equal(me.ok, true);
    assert.equal(me.data.username, 'laincat');
    assert.equal(store.get('last_username'), 'laincat');

    const detail = bangumi.handle('metadata.detail', JSON.stringify({subjectId: 400602, includeEpisodes: true}));
    assert.equal(detail.ok, true);
    assert.equal(detail.data.nameCn, '葬送的芙莉莲');
    assert.equal(detail.data.episodes.length, 1);

    const col = bangumi.handle('collection.get', JSON.stringify({subjectId: 400602}));
    assert.equal(col.ok, true);
    assert.equal(col.data.username, 'laincat');
    assert.equal(col.data.item.epStatus, 12);

    const upd = bangumi.handle('collection.update', JSON.stringify({subjectId: 400602, type: 'doing', epStatus: 13, rate: 9}));
    assert.equal(upd.ok, true);
    assert.equal(upd.data.updated, true);

    const epSingle = bangumi.handle('episode.update', JSON.stringify({episodeId: 12001, type: 'done'}));
    assert.equal(epSingle.ok, true);
    assert.equal(epSingle.data.mode, 'single');

    const epBatch = bangumi.handle('episode.update', JSON.stringify({subjectId: 400602, episodeIds: [12001, 12002], type: 2}));
    assert.equal(epBatch.ok, true);
    assert.equal(epBatch.data.mode, 'batch');

    for (const entry of logs) {
      assert.equal(entry.message.includes(token), false, 'token must never appear in logs');
    }
  });

  // v0 search success + legacy fallback when v0 fails
  withMockHost({
    secrets: {},
    fetch: req => {
      assert.ok(req.headers['User-Agent']?.includes('VeneraCat/'));
      if (req.url.startsWith('https://api.bgm.tv/v0/search/subjects')) {
        assert.equal(req.method, 'POST');
        const body = JSON.parse(req.body);
        if (body.keyword === 'v0-hit') {
          assert.deepEqual(body.filter.type, [2]);
          return JSON.stringify({total: 1, limit: 10, offset: 0, data: [{id: 1, type: 2, name: 'Test', name_cn: '测试', rating: {score: 8.5}}]});
        }
        throw new Error('v0 search unavailable');
      }
      if (req.url.startsWith('https://api.bgm.tv/search/subject/')) {
        assert.equal(req.method, 'GET');
        assert.ok(req.url.includes('responseGroup=large'));
        assert.ok(req.url.includes('type=2'));
        return JSON.stringify({results: 1, list: [{id: 400602, type: 2, name: '葬送のフリーレン', name_cn: '葬送的芙莉莲'}]});
      }
      throw new Error(`unexpected url: ${req.url}`);
    }
  }, () => {
    const v0 = bangumi.handle('metadata.search', JSON.stringify({keyword: 'v0-hit', type: 'anime', limit: 10}));
    assert.equal(v0.ok, true);
    assert.equal(v0.data.fallbackUsed, false);
    assert.equal(v0.data.items[0].score, 8.5);

    const legacy = bangumi.handle('metadata.search', JSON.stringify({keyword: '芙莉莲', type: 'anime', limit: 5}));
    assert.equal(legacy.ok, true);
    assert.equal(legacy.data.fallbackUsed, true);
    assert.equal(legacy.data.items[0].id, 400602);
  });

  // Secret redaction on error
  withMockHost({
    secrets: {access_token: token},
    fetch: () => {
      throw new Error(`HTTP 401 rejected Bearer ${token}`);
    }
  }, ({logs}) => {
    const res = bangumi.handle('account.me', '{}');
    assert.equal(res.ok, false);
    assert.equal(res.error.message.includes(token), false);
    assert.ok(res.error.message.includes('[REDACTED]'));
    for (const entry of logs) assert.equal(entry.message.includes(token), false);
  });
});

test('service.tmdb supports bearer & api_key auth, multi-search, movie/tv/season/episode detail, artwork, and redaction', () => {
  const desc = tmdb.describe();
  assert.deepEqual(desc.methods.map(m => m.name), ['metadata.search', 'metadata.detail', 'artwork.list']);

  // Missing both secrets -> structured error
  withMockHost({secrets: {}}, ({calls}) => {
    const res = tmdb.handle('metadata.search', JSON.stringify({query: 'Frieren'}));
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'MISSING_SECRET');
    assert.deepEqual(res.error.missingSecrets, ['api_read_token', 'api_key']);
    assert.equal(calls.length, 0);
  });

  // Bearer token mode (api_read_token)
  const readToken = 'tmdb-v4-read-token-secret';
  withMockHost({
    secrets: {api_read_token: readToken},
    fetch: req => {
      assert.equal(req.headers.Authorization, `Bearer ${readToken}`);
      assert.equal(req.url.includes('api_key='), false);
      if (req.url.startsWith('https://api.themoviedb.org/3/search/multi?')) {
        return JSON.stringify({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{id: 209867, media_type: 'tv', name: '葬送的芙莉莲', poster_path: '/p.jpg', backdrop_path: '/b.jpg'}]
        });
      }
      if (req.url.startsWith('https://api.themoviedb.org/3/tv/209867?')) {
        return JSON.stringify({
          id: 209867,
          name: '葬送的芙莉莲',
          number_of_seasons: 1,
          number_of_episodes: 28,
          seasons: [{id: 3001, season_number: 1, name: '第 1 季', episode_count: 28, poster_path: '/s1.jpg'}]
        });
      }
      if (req.url.startsWith('https://api.themoviedb.org/3/tv/209867/season/1?')) {
        return JSON.stringify({
          id: 3001,
          season_number: 1,
          name: '第 1 季',
          episodes: [{id: 9001, season_number: 1, episode_number: 1, name: '冒险的终点', still_path: '/e1.jpg'}]
        });
      }
      if (req.url.startsWith('https://api.themoviedb.org/3/tv/209867/images?')) {
        return JSON.stringify({
          id: 209867,
          posters: [{file_path: '/p1.jpg', width: 1000, height: 1500, iso_639_1: 'zh'}],
          backdrops: [{file_path: '/bg1.jpg', width: 1920, height: 1080, iso_639_1: null}],
          logos: [{file_path: '/logo.png', width: 500, height: 200, iso_639_1: 'en'}]
        });
      }
      throw new Error(`unexpected tmdb url: ${req.url}`);
    }
  }, ({logs}) => {
    const search = tmdb.handle('metadata.search', JSON.stringify({query: '芙莉莲'}));
    assert.equal(search.ok, true);
    assert.equal(search.data.items[0].posterUrl, 'https://image.tmdb.org/t/p/w500/p.jpg');

    const tv = tmdb.handle('metadata.detail', JSON.stringify({id: 209867, mediaType: 'tv'}));
    assert.equal(tv.ok, true);
    assert.equal(tv.data.seasons.length, 1);

    const season = tmdb.handle('metadata.detail', JSON.stringify({id: 209867, mediaType: 'tv', seasonNumber: 1}));
    assert.equal(season.ok, true);
    assert.equal(season.data.mediaType, 'season');
    assert.equal(season.data.episodes[0].stillUrl, 'https://image.tmdb.org/t/p/w500/e1.jpg');

    const art = tmdb.handle('artwork.list', JSON.stringify({id: 209867, mediaType: 'tv'}));
    assert.equal(art.ok, true);
    assert.equal(art.data.posters[0].url, 'https://image.tmdb.org/t/p/original/p1.jpg');
    assert.equal(art.data.backdrops[0].previewUrl, 'https://image.tmdb.org/t/p/w500/bg1.jpg');
    assert.equal(art.data.logos.length, 1);

    for (const entry of logs) assert.equal(entry.message.includes(readToken), false);
  });

  // Fallback v3 api_key mode + error redaction
  const apiKey = 'tmdb-v3-secret-key-777';
  withMockHost({
    secrets: {api_key: apiKey},
    fetch: req => {
      assert.equal(req.headers.Authorization, undefined);
      assert.ok(req.url.includes(`api_key=${apiKey}`));
      throw new Error(`request failed: ${req.url}`);
    }
  }, ({logs}) => {
    const res = tmdb.handle('metadata.detail', JSON.stringify({id: 550, mediaType: 'movie'}));
    assert.equal(res.ok, false);
    assert.equal(res.error.message.includes(apiKey), false);
    assert.ok(res.error.message.includes('[REDACTED]'));
    for (const entry of logs) assert.equal(entry.message.includes(apiKey), false);
  });
});

test('service.trakt supports all methods, v2 headers, scrobble persistence, and secret redaction', () => {
  const desc = trakt.describe();
  assert.deepEqual(
    desc.methods.map(m => m.name),
    ['account.me', 'metadata.search', 'watchlist.list', 'history.list', 'scrobble.start', 'scrobble.stop']
  );

  // Missing both secrets
  withMockHost({secrets: {}}, () => {
    const res = trakt.handle('account.me', '{}');
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'MISSING_SECRET');
    assert.deepEqual(res.error.missingSecrets, ['client_id', 'access_token']);
  });

  // metadata.search works with client_id alone (without access_token)
  const clientId = 'trakt-client-id-secret-abc';
  const accessToken = 'trakt-access-token-secret-xyz';
  withMockHost({
    secrets: {client_id: clientId},
    fetch: req => {
      assert.equal(req.headers['trakt-api-version'], '2');
      assert.equal(req.headers['trakt-api-key'], clientId);
      assert.equal(req.headers.Authorization, undefined);
      assert.ok(req.url.startsWith('https://api.trakt.tv/search/movie,show?'));
      return JSON.stringify([{type: 'show', score: 98.5, show: {title: 'Frieren', year: 2023, ids: {trakt: 210001}}}]);
    }
  }, () => {
    const res = trakt.handle('metadata.search', JSON.stringify({query: 'Frieren'}));
    assert.equal(res.ok, true);
    assert.equal(res.data.items[0].title, 'Frieren');
  });

  // Authenticated flows: account.me, watchlist.list, history.list, scrobble.start, scrobble.stop
  withMockHost({
    secrets: {client_id: clientId, access_token: accessToken},
    fetch: req => {
      assert.equal(req.headers['trakt-api-version'], '2');
      assert.equal(req.headers['trakt-api-key'], clientId);
      assert.equal(req.headers.Authorization, `Bearer ${accessToken}`);
      if (req.url === 'https://api.trakt.tv/users/settings') {
        return JSON.stringify({user: {username: 'lain', name: 'Lain', vip: true, ids: {slug: 'lain'}}});
      }
      if (req.url.startsWith('https://api.trakt.tv/sync/watchlist/shows/added?')) {
        return JSON.stringify([{id: 1, rank: 1, listed_at: '2026-11-01T00:00:00Z', type: 'show', show: {title: 'Frieren', year: 2023, ids: {trakt: 210001}}}]);
      }
      if (req.url.startsWith('https://api.trakt.tv/sync/history/episodes?')) {
        return JSON.stringify([{id: 88, watched_at: '2026-11-24T12:00:00Z', action: 'scrobble', type: 'episode', episode: {title: 'Ep 1', season: 1, number: 1, ids: {trakt: 5001}}, show: {title: 'Frieren', ids: {trakt: 210001}}}]);
      }
      if (req.url === 'https://api.trakt.tv/scrobble/start') {
        assert.equal(req.method, 'POST');
        const body = JSON.parse(req.body);
        assert.equal(body.progress, 15.5);
        return JSON.stringify({id: 700, action: 'start', progress: 15.5, episode: body.episode});
      }
      if (req.url === 'https://api.trakt.tv/scrobble/stop') {
        assert.equal(req.method, 'POST');
        const body = JSON.parse(req.body);
        assert.equal(body.progress, 96);
        return JSON.stringify({id: 701, action: 'scrobble', progress: 96, episode: body.episode});
      }
      throw new Error(`unexpected trakt url: ${req.url}`);
    }
  }, ({store, logs}) => {
    const me = trakt.handle('account.me', '{}');
    assert.equal(me.ok, true);
    assert.equal(me.data.slug, 'lain');
    assert.equal(store.get('last_user_slug'), 'lain');

    const wl = trakt.handle('watchlist.list', JSON.stringify({type: 'shows', sort: 'added'}));
    assert.equal(wl.ok, true);
    assert.equal(wl.data.items.length, 1);

    const hist = trakt.handle('history.list', JSON.stringify({type: 'episodes'}));
    assert.equal(hist.ok, true);
    assert.equal(hist.data.items[0].action, 'scrobble');

    const start = trakt.handle('scrobble.start', JSON.stringify({episode: {ids: {trakt: 5001}}, progress: 15.5}));
    assert.equal(start.ok, true);
    assert.equal(start.data.action, 'start');

    const stop = trakt.handle('scrobble.stop', JSON.stringify({episode: {ids: {trakt: 5001}}, progress: 96}));
    assert.equal(stop.ok, true);
    assert.equal(stop.data.action, 'scrobble');
    assert.equal(JSON.parse(store.get('last_scrobble')).progress, 96);

    for (const entry of logs) {
      assert.equal(entry.message.includes(clientId), false);
      assert.equal(entry.message.includes(accessToken), false);
    }
  });

  // Error redaction
  withMockHost({
    secrets: {client_id: clientId, access_token: accessToken},
    fetch: () => {
      throw new Error(`failed key=${clientId} Bearer ${accessToken}`);
    }
  }, ({logs}) => {
    const res = trakt.handle('account.me', '{}');
    assert.equal(res.ok, false);
    assert.equal(res.error.message.includes(clientId), false);
    assert.equal(res.error.message.includes(accessToken), false);
    for (const entry of logs) {
      assert.equal(entry.message.includes(clientId), false);
      assert.equal(entry.message.includes(accessToken), false);
    }
  });
});

test('reader-preferences.vcmodule matches catalog/source.json settings-module entry and declarative boundary', () => {
  const catalog = JSON.parse(readFileSync(resolve(ROOT, 'catalog/source.json'), 'utf8'));
  const entry = catalog.entries.find(e => e.id === 'reader-preferences');
  assert.ok(entry);
  assert.equal(entry.kind, 'settings-module');
  assert.equal(entry.input.file, 'templates/modules/reader-preferences.vcmodule');

  const raw = readFileSync(resolve(ROOT, entry.input.file), 'utf8');
  const headers = {};
  const sections = [];
  const keysBySection = {};
  let currentSection = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;
    if (trimmed.startsWith('#!')) {
      const idx = trimmed.indexOf('=');
      assert.ok(idx > 2, `malformed header: ${trimmed}`);
      headers[trimmed.slice(2, idx).trim()] = trimmed.slice(idx + 1).trim();
    } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).trim();
      sections.push(currentSection);
      keysBySection[currentSection] = {};
    } else if (currentSection) {
      const idx = trimmed.indexOf('=');
      assert.ok(idx > 0, `malformed setting line: ${trimmed}`);
      keysBySection[currentSection][trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }

  assert.equal(headers.id, entry.id);
  assert.equal(headers.name, entry.name);
  assert.equal(headers.version, entry.version);
  assert.equal(headers.format, 'veneracat-module/1-draft');
  assert.deepEqual(headers.requires.split(',').map(s => s.trim()), entry.supports.requiresCapabilities);

  // Declarative settings only; no Surge proxy/MITM/script sections
  assert.deepEqual(sections, ['Reader']);
  assert.equal(keysBySection.Reader['page-gap'], '8');
  assert.equal(keysBySection.Reader['keep-screen-on'], 'true');
});

test('services handle denied permissions, invalid payloads, and unsupported methods cleanly', () => {
  for (const [svc, method] of [
    [bangumi, 'account.me'],
    [tmdb, 'metadata.search'],
    [trakt, 'account.me']
  ]) {
    withMockHost({denySecrets: true}, () => {
      const denied = svc.handle(method, JSON.stringify({query: 'test'}));
      assert.equal(denied.ok, false);
      assert.equal(denied.error.code, 'SECRET_UNAVAILABLE');
    });

    withMockHost({secrets: {}}, () => {
      const badJson = svc.handle(method, '{not-json');
      assert.equal(badJson.ok, false);
      assert.equal(badJson.error.code, 'INVALID_PAYLOAD');

      const unknown = svc.handle('unknown.method', '{}');
      assert.equal(unknown.ok, false);
      assert.equal(unknown.error.code, 'UNSUPPORTED_METHOD');
    });
  }

  // Storage permission withheld must not break read/write methods
  withMockHost({
    denyStorage: true,
    secrets: {access_token: 'bgm-tok', api_key: 'tmdb-k', client_id: 'trakt-c'},
    fetch: req => {
      if (req.url === 'https://api.bgm.tv/v0/me') return JSON.stringify({id: 1, username: 'u'});
      if (req.url.startsWith('https://api.themoviedb.org/3/movie/10?')) return JSON.stringify({id: 10, title: 'M'});
      if (req.url === 'https://api.trakt.tv/users/settings') return JSON.stringify({user: {username: 'u', ids: {slug: 'u'}}});
      throw new Error(`unexpected: ${req.url}`);
    }
  }, () => {
    assert.equal(bangumi.handle('account.me', '{}').ok, true);
    assert.equal(tmdb.handle('metadata.detail', JSON.stringify({id: 10, mediaType: 'movie'})).ok, true);
    assert.equal(trakt.handle('account.me', '{}').ok, true);
  });
});

