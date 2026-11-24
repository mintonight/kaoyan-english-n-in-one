(function (global) {
  'use strict';

  var KEYS = {
    NOTES: 'kaoyan_reading_notes_v1',
    LOG: 'kaoyan_reading_log_v1',
    SP_RES: 'zaowen-word-spell-v5',
    SP_LOG: 'piviaa-wseyrsmh-weo-j8',
    TR_DRAFTS: 'kaoyan_translation_drafts_v1',
    CFG: 'kaoyan_gist_config',
    DEV: 'kaoyan_device_id'
  };
  var GIST_FILE = 'kaoyan-study-data.json';
  var GIST_DESC = '考研英语学习记录（阅读 + 拼写 + 翻译，多端同步）';

  var inFlight = null;
  var debounceTimer = null;
  var localChangeSeq = 0;
  var statusListeners = [];

  function readLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function getDeviceId() {
    try {
      var id = localStorage.getItem(KEYS.DEV);
      if (id && /^d_[a-z0-9]+$/i.test(id)) return id;
      id = 'd_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(KEYS.DEV, id);
      return id;
    } catch (e) {
      return 'd_local';
    }
  }

  function getConfig() {
    var c = readLS(KEYS.CFG, {});
    return {
      token: String(c.token || '').trim(),
      gistId: String(c.gistId || '').trim(),
      filename: c.filename || GIST_FILE,
      autoSync: c.autoSync !== false,
      dirty: !!c.dirty,
      lastSyncAt: Number(c.lastSyncAt || 0)
    };
  }

  function saveConfig(patch) {
    var cur = getConfig();
    var next = {
      token: patch.token !== undefined ? String(patch.token || '').trim() : cur.token,
      gistId: patch.gistId !== undefined ? String(patch.gistId || '').trim() : cur.gistId,
      filename: GIST_FILE,
      autoSync: patch.autoSync !== undefined ? !!patch.autoSync : cur.autoSync,
      dirty: patch.dirty !== undefined ? !!patch.dirty : cur.dirty,
      lastSyncAt: patch.lastSyncAt !== undefined ? Number(patch.lastSyncAt || 0) : cur.lastSyncAt
    };
    writeLS(KEYS.CFG, next);
    return next;
  }

  /* ---------- Normalization (backward compatible with v1) ---------- */

  function toTs(val, fallback) {
    if (typeof val === 'number' && isFinite(val) && val > 0) return val;
    if (typeof val === 'string' && val) {
      var parsed = Date.parse(val);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return fallback || 0;
  }

  function normalizeNotes(raw, fallbackTs) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      if (typeof v === 'string') {
        out[k] = { text: v, updatedAt: v.trim() ? (fallbackTs || 1) : 0 };
      } else if (v && typeof v === 'object') {
        var text = typeof v.text === 'string' ? v.text : '';
        var ts = toTs(v.updatedAt, text.trim() ? (fallbackTs || 1) : 0);
        out[k] = { text: text, updatedAt: ts };
      }
    });
    return out;
  }

  function normalizeReadingLog(raw, fallbackTs) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (pid) {
      var pmap = raw[pid];
      if (!pmap || typeof pmap !== 'object') return;
      out[pid] = {};
      Object.keys(pmap).forEach(function (qn) {
        var r = pmap[qn];
        if (!r || typeof r !== 'object') return;
        var ts = toTs(r.updatedAt, toTs(r.answeredAt, fallbackTs || 1));
        if (r.deleted) {
          out[pid][qn] = { deleted: true, updatedAt: ts };
        } else if (r.answer) {
          out[pid][qn] = {
            answer: String(r.answer),
            correct: !!r.correct,
            timeMs: Math.max(0, Number(r.timeMs) || 0),
            answeredAt: r.answeredAt || new Date(ts).toISOString(),
            updatedAt: ts,
            attempts: Math.max(1, Number(r.attempts) || 1)
          };
        }
      });
    });
    return out;
  }

  function sumTuples(byDev, len) {
    var sums = [];
    for (var i = 0; i < len; i++) sums.push(0);
    Object.keys(byDev).forEach(function (d) {
      var arr = byDev[d];
      if (!Array.isArray(arr)) return;
      for (var j = 0; j < len; j++) sums[j] += Math.max(0, Number(arr[j]) || 0);
    });
    return sums;
  }

  function normalizeFavorites(rawFavs, fallbackTs) {
    var out = {};
    if (!rawFavs || typeof rawFavs !== 'object') return out;
    Object.keys(rawFavs).forEach(function (k) {
      var f = rawFavs[k];
      if (f === true) {
        var ts = fallbackTs || 1;
        out[k] = { starred: true, addedAt: ts, updatedAt: ts };
      } else if (f && typeof f === 'object') {
        var starred = !!f.starred;
        var updatedAt = toTs(f.updatedAt, toTs(f.addedAt, fallbackTs || 1));
        var addedAt = toTs(f.addedAt, starred ? updatedAt : 0);
        out[k] = { starred: starred, addedAt: addedAt, updatedAt: updatedAt };
      }
    });
    return out;
  }

  function normalizeSpelling(rawLog, rawRes, fallbackTs) {
    var log = (rawLog && typeof rawLog === 'object') ? rawLog : {};
    var res = (rawRes && typeof rawRes === 'object') ? rawRes : {};
    var resetAt = toTs(log.resetAt, 0);
    var items = {};
    var srcItems = (log.items && typeof log.items === 'object') ? log.items : {};

    Object.keys(srcItems).forEach(function (k) {
      var e = srcItems[k];
      if (!e || typeof e !== 'object') return;
      var byDev = {};
      if (e.byDev && typeof e.byDev === 'object') {
        Object.keys(e.byDev).forEach(function (d) {
          var a = e.byDev[d];
          if (Array.isArray(a)) {
            byDev[d] = [
              Math.max(0, Number(a[0]) || 0),
              Math.max(0, Number(a[1]) || 0),
              Math.max(0, Number(a[2]) || 0)
            ];
          }
        });
      } else {
        byDev._legacy = [
          Math.max(0, Number(e.attempts) || 0),
          Math.max(0, Number(e.ok) || 0),
          Math.max(0, Number(e.bad) || 0)
        ];
      }
      var sums = sumTuples(byDev, 3);
      var lastTs = toTs(e.lastAt, fallbackTs || 1);
      var mastered = e.mastered || (e.revealed ? '' : (e.lastResult === 'ok' ? 'ok' : (e.lastResult === 'bad' ? 'wrong' : '')));
      var masteredAt = toTs(e.masteredAt, mastered ? lastTs : 0);
      items[k] = {
        byDev: byDev,
        attempts: sums[0],
        ok: sums[1],
        bad: sums[2],
        lastResult: e.lastResult || '',
        lastAt: e.lastAt || (lastTs > 1 ? new Date(lastTs).toISOString() : ''),
        revealed: !!e.revealed,
        mastered: mastered,
        masteredAt: masteredAt
      };
    });

    // Ensure legacy results (zaowen-word-spell-v5) entries are captured in items too
    Object.keys(res).forEach(function (k) {
      var st = res[k];
      if (st !== 'ok' && st !== 'wrong') return;
      if (!items[k]) {
        items[k] = {
          byDev: {},
          attempts: 0,
          ok: 0,
          bad: 0,
          lastResult: st === 'ok' ? 'ok' : 'bad',
          lastAt: '',
          revealed: false,
          mastered: st,
          masteredAt: fallbackTs || 1
        };
      } else if (!items[k].mastered) {
        items[k].mastered = st;
        items[k].masteredAt = Math.max(items[k].masteredAt || 0, fallbackTs || 1);
      }
    });

    var words = {};
    var srcWords = (log.words && typeof log.words === 'object') ? log.words : {};
    Object.keys(srcWords).forEach(function (wk) {
      var w = srcWords[wk];
      if (!w || typeof w !== 'object') return;
      var byDev = {};
      if (w.byDev && typeof w.byDev === 'object') {
        Object.keys(w.byDev).forEach(function (d) {
          var a = w.byDev[d];
          if (Array.isArray(a)) {
            byDev[d] = [Math.max(0, Number(a[0]) || 0), Math.max(0, Number(a[1]) || 0)];
          }
        });
      } else {
        byDev._legacy = [Math.max(0, Number(w.right) || 0), Math.max(0, Number(w.wrong) || 0)];
      }
      var sums = sumTuples(byDev, 2);
      words[wk] = {
        word: String(w.word || wk),
        byDev: byDev,
        right: sums[0],
        wrong: sums[1],
        updatedAt: toTs(w.updatedAt, fallbackTs || 1)
      };
    });

    var favorites = normalizeFavorites(log.favorites, fallbackTs);
    var out = { items: items, words: words, favorites: favorites, totals: { checks: 0, itemOk: 0, itemBad: 0 }, results: {}, resetAt: resetAt };
    recomputeSpellingDerived(out);
    return out;
  }

  function recomputeSpellingDerived(sp) {
    var itemOk = 0, itemBad = 0;
    var results = {};
    if (!sp.favorites || typeof sp.favorites !== 'object') sp.favorites = {};
    Object.keys(sp.items).forEach(function (k) {
      var e = sp.items[k];
      if (e.byDev) {
        var s = sumTuples(e.byDev, 3);
        e.attempts = s[0];
        e.ok = s[1];
        e.bad = s[2];
      }
      itemOk += e.ok || 0;
      itemBad += e.bad || 0;
      if (e.mastered === 'ok' || e.mastered === 'wrong') results[k] = e.mastered;
    });
    Object.keys(sp.words).forEach(function (wk) {
      var w = sp.words[wk];
      if (w.byDev) {
        var ws = sumTuples(w.byDev, 2);
        w.right = ws[0];
        w.wrong = ws[1];
      }
    });
    sp.totals = { checks: itemOk + itemBad, itemOk: itemOk, itemBad: itemBad };
    sp.results = results;
    return sp;
  }

  /* ---------- Local state read / write ---------- */

  function loadReadingNotes() {
    return normalizeNotes(readLS(KEYS.NOTES, {}), 1);
  }

  function saveReadingNotes(notes) {
    writeLS(KEYS.NOTES, notes);
  }

  function loadReadingLog() {
    return normalizeReadingLog(readLS(KEYS.LOG, {}), 1);
  }

  function saveReadingLog(log) {
    writeLS(KEYS.LOG, log);
  }

  function loadSpellingNormalized() {
    return normalizeSpelling(readLS(KEYS.SP_LOG, {}), readLS(KEYS.SP_RES, {}), 1);
  }

  function loadTranslationDrafts() {
    return normalizeNotes(readLS(KEYS.TR_DRAFTS, {}), 1);
  }

  function saveTranslationDrafts(drafts) {
    writeLS(KEYS.TR_DRAFTS, drafts);
  }

  function saveSpellingNormalized(sp) {
    recomputeSpellingDerived(sp);
    writeLS(KEYS.SP_RES, sp.results);
    writeLS(KEYS.SP_LOG, {
      items: sp.items,
      words: sp.words,
      favorites: sp.favorites || {},
      totals: sp.totals,
      resetAt: sp.resetAt || 0
    });
  }

  function buildLocalPayload() {
    var sp = loadSpellingNormalized();
    return {
      app: 'kaoyan-english-n-in-one',
      version: 2,
      updatedAt: new Date().toISOString(),
      reading: {
        notes: loadReadingNotes(),
        log: loadReadingLog()
      },
      spelling: {
        items: sp.items,
        words: sp.words,
        favorites: sp.favorites || {},
        totals: sp.totals,
        results: sp.results,
        resetAt: sp.resetAt || 0
      },
      translation: {
        drafts: loadTranslationDrafts()
      }
    };
  }

  function normalizePayload(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        app: 'kaoyan-english-n-in-one',
        version: 2,
        updatedAt: '',
        reading: { notes: {}, log: {} },
        spelling: normalizeSpelling({}, {}, 0),
        translation: { drafts: {} }
      };
    }
    var ts = toTs(raw.updatedAt, 1);
    var r = (raw.reading && typeof raw.reading === 'object') ? raw.reading : {};
    var s = (raw.spelling && typeof raw.spelling === 'object') ? raw.spelling : {};
    var t = (raw.translation && typeof raw.translation === 'object') ? raw.translation : {};
    return {
      app: 'kaoyan-english-n-in-one',
      version: 2,
      updatedAt: raw.updatedAt || '',
      reading: {
        notes: normalizeNotes(r.notes, ts),
        log: normalizeReadingLog(r.log, ts)
      },
      spelling: normalizeSpelling(s, s.results || {}, ts),
      translation: {
        drafts: normalizeNotes(t.drafts, ts)
      }
    };
  }

  /* ---------- Deterministic CRDT / LWW Two-Way Merge ---------- */

  function mergeNotes(a, b) {
    var out = {};
    var keys = Object.create(null);
    Object.keys(a).forEach(function (k) { keys[k] = 1; });
    Object.keys(b).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var na = a[k], nb = b[k];
      if (!na) { out[k] = nb; return; }
      if (!nb) { out[k] = na; return; }
      if (nb.updatedAt > na.updatedAt) out[k] = nb;
      else if (na.updatedAt > nb.updatedAt) out[k] = na;
      else out[k] = (nb.text.length > na.text.length) ? nb : na;
    });
    return out;
  }

  function mergeReadingLog(a, b) {
    var out = {};
    var pids = Object.create(null);
    Object.keys(a).forEach(function (p) { pids[p] = 1; });
    Object.keys(b).forEach(function (p) { pids[p] = 1; });
    Object.keys(pids).forEach(function (pid) {
      var pa = a[pid] || {}, pb = b[pid] || {};
      var qns = Object.create(null);
      Object.keys(pa).forEach(function (q) { qns[q] = 1; });
      Object.keys(pb).forEach(function (q) { qns[q] = 1; });
      out[pid] = {};
      Object.keys(qns).forEach(function (qn) {
        var ra = pa[qn], rb = pb[qn];
        if (!ra) { out[pid][qn] = rb; return; }
        if (!rb) { out[pid][qn] = ra; return; }
        if (rb.updatedAt > ra.updatedAt) out[pid][qn] = rb;
        else if (ra.updatedAt > rb.updatedAt) out[pid][qn] = ra;
        else if (ra.deleted && !rb.deleted) out[pid][qn] = rb;
        else if (!ra.deleted && rb.deleted) out[pid][qn] = ra;
        else out[pid][qn] = ((rb.attempts || 0) > (ra.attempts || 0)) ? rb : ra;
      });
    });
    return out;
  }

  function mergeDevTuples(da, db, len) {
    var out = {};
    var devs = Object.create(null);
    Object.keys(da || {}).forEach(function (d) { devs[d] = 1; });
    Object.keys(db || {}).forEach(function (d) { devs[d] = 1; });
    Object.keys(devs).forEach(function (d) {
      var va = (da && da[d]) || [];
      var vb = (db && db[d]) || [];
      var arr = [];
      for (var i = 0; i < len; i++) arr.push(Math.max(Number(va[i]) || 0, Number(vb[i]) || 0));
      out[d] = arr;
    });
    return out;
  }

  function filterSpellingByReset(sp, resetAt) {
    if (!resetAt) return sp;
    var items = {};
    Object.keys(sp.items).forEach(function (k) {
      var e = sp.items[k];
      var ts = Math.max(toTs(e.lastAt, 0), e.masteredAt || 0);
      if (ts > resetAt) items[k] = e;
    });
    var words = {};
    Object.keys(sp.words).forEach(function (wk) {
      var w = sp.words[wk];
      if ((w.updatedAt || 0) > resetAt) words[wk] = w;
    });
    return { items: items, words: words, favorites: sp.favorites || {}, totals: { checks: 0, itemOk: 0, itemBad: 0 }, results: {}, resetAt: resetAt };
  }

  function mergeFavorites(fa, fb) {
    var out = {};
    var keys = Object.create(null);
    Object.keys(fa || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(fb || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var a = fa && fa[k], b = fb && fb[k];
      if (!a) { out[k] = { starred: !!b.starred, addedAt: b.addedAt || 0, updatedAt: b.updatedAt || 0 }; return; }
      if (!b) { out[k] = { starred: !!a.starred, addedAt: a.addedAt || 0, updatedAt: a.updatedAt || 0 }; return; }
      var ua = a.updatedAt || 0, ub = b.updatedAt || 0;
      if (ub > ua) out[k] = { starred: !!b.starred, addedAt: b.addedAt || 0, updatedAt: ub };
      else if (ua > ub) out[k] = { starred: !!a.starred, addedAt: a.addedAt || 0, updatedAt: ua };
      else if (a.starred !== b.starred) {
        var win = a.starred ? a : b;
        out[k] = { starred: true, addedAt: win.addedAt || 0, updatedAt: ua };
      } else {
        out[k] = { starred: !!a.starred, addedAt: Math.max(a.addedAt || 0, b.addedAt || 0), updatedAt: ua };
      }
    });
    return out;
  }

  function mergeSpelling(a, b) {
    var resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
    var fa = filterSpellingByReset(a, resetAt);
    var fb = filterSpellingByReset(b, resetAt);

    var items = {};
    var itemKeys = Object.create(null);
    Object.keys(fa.items).forEach(function (k) { itemKeys[k] = 1; });
    Object.keys(fb.items).forEach(function (k) { itemKeys[k] = 1; });
    Object.keys(itemKeys).forEach(function (k) {
      var ia = fa.items[k], ib = fb.items[k];
      if (!ia) { items[k] = ib; return; }
      if (!ib) { items[k] = ia; return; }
      var byDev = mergeDevTuples(ia.byDev, ib.byDev, 3);
      var ta = toTs(ia.lastAt, 0), tb = toTs(ib.lastAt, 0);
      var latest = tb > ta ? ib : ia;
      var mastered = ia.mastered, masteredAt = ia.masteredAt || 0;
      if ((ib.masteredAt || 0) > masteredAt) {
        mastered = ib.mastered;
        masteredAt = ib.masteredAt || 0;
      } else if ((ib.masteredAt || 0) === masteredAt && ib.mastered === 'ok' && mastered !== 'ok') {
        mastered = 'ok';
      }
      items[k] = {
        byDev: byDev,
        attempts: 0,
        ok: 0,
        bad: 0,
        lastResult: latest.lastResult,
        lastAt: latest.lastAt,
        revealed: latest.revealed,
        mastered: mastered,
        masteredAt: masteredAt
      };
    });

    var words = {};
    var wordKeys = Object.create(null);
    Object.keys(fa.words).forEach(function (k) { wordKeys[k] = 1; });
    Object.keys(fb.words).forEach(function (k) { wordKeys[k] = 1; });
    Object.keys(wordKeys).forEach(function (wk) {
      var wa = fa.words[wk], wb = fb.words[wk];
      if (!wa) { words[wk] = wb; return; }
      if (!wb) { words[wk] = wa; return; }
      words[wk] = {
        word: wb.word || wa.word || wk,
        byDev: mergeDevTuples(wa.byDev, wb.byDev, 2),
        right: 0,
        wrong: 0,
        updatedAt: Math.max(wa.updatedAt || 0, wb.updatedAt || 0)
      };
    });

    return recomputeSpellingDerived({
      items: items,
      words: words,
      favorites: mergeFavorites(fa.favorites, fb.favorites),
      totals: { checks: 0, itemOk: 0, itemBad: 0 },
      results: {},
      resetAt: resetAt
    });
  }

  function mergePayloads(localRaw, remoteRaw) {
    var loc = normalizePayload(localRaw);
    var rem = normalizePayload(remoteRaw);
    return {
      app: 'kaoyan-english-n-in-one',
      version: 2,
      updatedAt: new Date().toISOString(),
      reading: {
        notes: mergeNotes(loc.reading.notes, rem.reading.notes),
        log: mergeReadingLog(loc.reading.log, rem.reading.log)
      },
      spelling: mergeSpelling(loc.spelling, rem.spelling),
      translation: {
        drafts: mergeNotes(loc.translation.drafts, rem.translation.drafts)
      }
    };
  }

  function canonicalString(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonicalString).join(',') + ']';
    var keys = Object.keys(obj).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + canonicalString(obj[k]); }).join(',') + '}';
  }

  function contentFingerprint(payload) {
    var norm = normalizePayload(payload);
    return canonicalString({ reading: norm.reading, spelling: norm.spelling, translation: norm.translation });
  }

  function persistMergedPayload(merged) {
    saveReadingNotes(merged.reading.notes);
    saveReadingLog(merged.reading.log);
    saveSpellingNormalized(merged.spelling);
    saveTranslationDrafts((merged.translation && merged.translation.drafts) || {});
  }

  /* ---------- GitHub Gist API ---------- */

  async function github(method, path, body, token) {
    var res = await fetch('https://api.github.com' + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 204) return null;
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var detail = (data && data.message) ? data.message : ('HTTP ' + res.status);
      if (res.status === 401) detail = 'Token 无效或已过期，请确认勾选了 gist 权限';
      else if (res.status === 403) detail = 'GitHub API 权限不足或频率受限（' + detail + '）';
      else if (res.status === 404) detail = '找不到该 Gist ID，请检查 ID 或清空后重新同步以自动查找';
      var err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function discoverGistId(token) {
    var list = await github('GET', '/gists?per_page=100', null, token);
    if (!Array.isArray(list)) return '';
    var matches = list.filter(function (g) { return g && g.files && g.files[GIST_FILE]; });
    if (!matches.length) return '';
    matches.sort(function (a, b) { return Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0); });
    return matches[0].id || '';
  }

  async function readGistContent(gist) {
    var f = gist && gist.files && gist.files[GIST_FILE];
    if (!f) return null;
    var text = f.content || '';
    if (f.truncated && f.raw_url) {
      var rawRes = await fetch(f.raw_url);
      if (!rawRes.ok) throw new Error('读取大文件 Gist 失败（HTTP ' + rawRes.status + '）');
      text = await rawRes.text();
    }
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('云端 Gist JSON 格式损坏，已中止以防覆盖本地数据');
    }
  }

  function emitStatus(text, isErr) {
    statusListeners.forEach(function (fn) {
      try { fn(text, !!isErr); } catch (e) {}
    });
  }

  function emitSynced(detail) {
    try {
      window.dispatchEvent(new CustomEvent('kaoyan:data-synced', { detail: detail }));
    } catch (e) {}
  }

  /* ---------- Unified Two-Way Sync ---------- */

  async function sync(opts) {
    opts = opts || {};
    if (inFlight) return inFlight;

    inFlight = (async function () {
      var cfg = getConfig();
      var token = opts.token !== undefined ? String(opts.token || '').trim() : cfg.token;
      var gistId = opts.gistId !== undefined ? String(opts.gistId || '').trim() : cfg.gistId;

      if (!token) {
        var msgNoTok = '请先填写 GitHub Token（需勾选 gist 权限）';
        if (!opts.silent) emitStatus(msgNoTok, true);
        return { ok: false, message: msgNoTok };
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        var msgOff = '当前处于离线状态，数据已保存在本机，联网后将自动同步';
        emitStatus(msgOff, false);
        return { ok: false, offline: true, message: msgOff };
      }

      emitStatus('正在双向同步…', false);

      try {
        // 1. Auto-discover existing Gist if gistId is blank
        if (!gistId) {
          emitStatus('正在查找云端已有同步记录…', false);
          gistId = await discoverGistId(token);
        }

        // 2. Create brand-new private Gist if none exists
        if (!gistId) {
          var seqCreate = localChangeSeq;
          var initial = buildLocalPayload();
          var filesCreate = {};
          filesCreate[GIST_FILE] = { content: JSON.stringify(initial, null, 2) };
          var created = await github('POST', '/gists', {
            description: GIST_DESC,
            public: false,
            files: filesCreate
          }, token);
          gistId = created && created.id ? created.id : '';
          saveConfig({
            token: token,
            gistId: gistId,
            dirty: localChangeSeq !== seqCreate,
            lastSyncAt: Date.now()
          });
          var msgCreated = '已自动创建云端 Gist 并推送（' + new Date().toLocaleTimeString() + '）';
          emitStatus(msgCreated, false);
          emitSynced({ gistId: gistId, localChanged: false, remoteChanged: true });
          return { ok: true, action: 'created', gistId: gistId, message: msgCreated };
        }

        // 3. Always fetch remote first — abort on failure (never blindly PATCH!)
        var remoteGist = await github('GET', '/gists/' + encodeURIComponent(gistId), null, token);
        var remoteRaw = await readGistContent(remoteGist);

        // 4. Snapshot local AFTER GET so edits made mid-fetch are preserved
        var seqAtMerge = localChangeSeq;
        var localRaw = buildLocalPayload();
        var merged = remoteRaw ? mergePayloads(localRaw, remoteRaw) : normalizePayload(localRaw);

        var localFp = contentFingerprint(localRaw);
        var remoteFp = remoteRaw ? contentFingerprint(remoteRaw) : '';
        var mergedFp = contentFingerprint(merged);

        var localChanged = mergedFp !== localFp;
        var remoteChanged = (!remoteRaw) || (mergedFp !== remoteFp) || (remoteRaw.version !== 2 && !!opts.forceUpgrade);

        if (localChanged) {
          persistMergedPayload(merged);
        }

        if (remoteChanged) {
          var filesPatch = {};
          filesPatch[GIST_FILE] = { content: JSON.stringify(merged, null, 2) };
          await github('PATCH', '/gists/' + encodeURIComponent(gistId), { files: filesPatch }, token);
        }

        var stillDirty = localChangeSeq !== seqAtMerge;
        saveConfig({
          token: token,
          gistId: gistId,
          dirty: stillDirty,
          lastSyncAt: Date.now()
        });

        var timeStr = new Date().toLocaleTimeString();
        var summary;
        if (localChanged && remoteChanged) summary = '双向合并同步完成（' + timeStr + '）';
        else if (localChanged) summary = '已拉取云端最新记录（' + timeStr + '）';
        else if (remoteChanged) summary = '已推送本地记录到云端（' + timeStr + '）';
        else summary = '已是最新，无需改动（' + timeStr + '）';

        emitStatus(summary, false);
        emitSynced({ gistId: gistId, localChanged: localChanged, remoteChanged: remoteChanged });

        if (stillDirty && getConfig().autoSync) {
          scheduleAutoSync();
        }
        return { ok: true, gistId: gistId, localChanged: localChanged, remoteChanged: remoteChanged, message: summary };
      } catch (e) {
        var errMsg = '同步失败：' + (e && e.message ? e.message : String(e));
        emitStatus(errMsg, true);
        return { ok: false, message: errMsg };
      }
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function scheduleAutoSync(delayMs) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      var cfg = getConfig();
      if (!cfg.token || !cfg.autoSync) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      sync({ silent: true });
    }, typeof delayMs === 'number' ? delayMs : 4000);
  }

  function markDirty(delayMs) {
    localChangeSeq++;
    var cfg = saveConfig({ dirty: true });
    if (cfg.token && cfg.autoSync) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        emitStatus('离线更改已保存到本机，联网后将自动同步', false);
      } else {
        scheduleAutoSync(typeof delayMs === 'number' ? delayMs : 4000);
      }
    }
  }

  /* ---------- Local JSON Backup Export / Import ---------- */

  function exportBackup() {
    return JSON.stringify(buildLocalPayload(), null, 2);
  }

  function importBackup(jsonText) {
    var parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || (!parsed.reading && !parsed.spelling && !parsed.translation)) {
      throw new Error('不是有效的考研英语备份文件');
    }
    var merged = mergePayloads(buildLocalPayload(), parsed);
    persistMergedPayload(merged);
    markDirty();
    emitSynced({ localChanged: true, remoteChanged: false });
    return merged;
  }

  /* ---------- Shared Sync UI Binder ---------- */

  function bindSyncUI(els) {
    if (!els) return;
    function refreshFields() {
      var c = getConfig();
      if (els.tokenInput) els.tokenInput.value = c.token;
      if (els.gistIdInput) els.gistIdInput.value = c.gistId;
      if (els.autoSyncCheckbox) els.autoSyncCheckbox.checked = c.autoSync;
      if (els.statusEl && !els.statusEl.dataset.touched) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          els.statusEl.textContent = '当前离线；更改保存在本机，联网后自动同步。';
        } else if (c.lastSyncAt) {
          els.statusEl.textContent = (c.dirty ? '有待同步更改 · ' : '已同步 · ') + '上次同步：' + new Date(c.lastSyncAt).toLocaleString();
        } else if (c.token) {
          els.statusEl.textContent = '已配置 Token，点击「立即同步」自动查找或创建云端 Gist。';
        } else {
          els.statusEl.textContent = '数据默认保存在本机；只需填入 GitHub Token（gist 权限），即可跨设备自动双向同步。';
        }
      }
    }

    function readInputs() {
      return {
        token: els.tokenInput ? els.tokenInput.value.trim() : getConfig().token,
        gistId: els.gistIdInput ? els.gistIdInput.value.trim() : getConfig().gistId,
        autoSync: els.autoSyncCheckbox ? !!els.autoSyncCheckbox.checked : getConfig().autoSync
      };
    }

    function setLocalStatus(msg, isErr) {
      if (!els.statusEl) return;
      els.statusEl.dataset.touched = '1';
      els.statusEl.textContent = msg;
      els.statusEl.style.color = isErr ? (els.errColor || 'var(--danger-color, var(--warn, #b91c1c))') : '';
    }

    statusListeners.push(function (msg, isErr) {
      setLocalStatus(msg, isErr);
      var c = getConfig();
      if (els.gistIdInput && c.gistId && els.gistIdInput.value !== c.gistId) {
        els.gistIdInput.value = c.gistId;
      }
    });

    if (els.autoSyncCheckbox) {
      els.autoSyncCheckbox.addEventListener('change', function () {
        saveConfig({ autoSync: !!els.autoSyncCheckbox.checked });
        setLocalStatus(els.autoSyncCheckbox.checked ? '已开启自动双向同步' : '已关闭自动同步（仍可手动点击同步）', false);
      });
    }

    if (els.btnSave) {
      els.btnSave.addEventListener('click', function () {
        var r = readInputs();
        if (!r.token) { setLocalStatus('请填写 GitHub Token（需 gist 权限）', true); return; }
        saveConfig(r);
        setLocalStatus('配置已保存在本机' + (r.gistId ? '' : '（Gist ID 留空将在同步时自动查找/新建）'), false);
      });
    }

    if (els.btnSync) {
      els.btnSync.addEventListener('click', async function () {
        var r = readInputs();
        if (!r.token) { setLocalStatus('请先填写 GitHub Token（需 gist 权限）', true); return; }
        saveConfig(r);
        els.btnSync.disabled = true;
        try {
          var res = await sync({ token: r.token, gistId: r.gistId, forceUpgrade: true });
          if (res && res.gistId && els.gistIdInput) els.gistIdInput.value = res.gistId;
        } finally {
          els.btnSync.disabled = false;
        }
      });
    }

    if (els.btnExport) {
      els.btnExport.addEventListener('click', function () {
        var blob = new Blob([exportBackup()], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'kaoyan-study-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        setLocalStatus('已导出本地 JSON 备份', false);
      });
    }

    if (els.btnImport && els.importFile) {
      els.btnImport.addEventListener('click', function () { els.importFile.click(); });
      els.importFile.addEventListener('change', function () {
        var file = els.importFile.files && els.importFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            importBackup(String(reader.result || ''));
            setLocalStatus('已合并导入备份文件（未覆盖现有新记录）', false);
          } catch (e) {
            setLocalStatus('导入失败：' + e.message, true);
          }
          els.importFile.value = '';
        };
        reader.readAsText(file);
      });
    }

    refreshFields();
    return { refresh: refreshFields };
  }

  /* ---------- Lifecycle Auto-Sync Hooks ---------- */

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('online', function () {
      var c = getConfig();
      if (c.token && c.autoSync) scheduleAutoSync(600);
    });

    document.addEventListener('visibilitychange', function () {
      var c = getConfig();
      if (!c.token || !c.autoSync || navigator.onLine === false) return;
      if (document.visibilityState === 'hidden') {
        if (c.dirty) {
          clearTimeout(debounceTimer);
          sync({ silent: true });
        }
      } else if (document.visibilityState === 'visible') {
        if (Date.now() - (c.lastSyncAt || 0) > 30000 || c.dirty) {
          scheduleAutoSync(500);
        }
      }
    });

    window.addEventListener('load', function () {
      var c = getConfig();
      if (c.token && c.autoSync && navigator.onLine !== false) {
        scheduleAutoSync(600);
      }
    });
  }

  global.KaoyanSync = {
    KEYS: KEYS,
    GIST_FILE: GIST_FILE,
    getDeviceId: getDeviceId,
    getConfig: getConfig,
    saveConfig: saveConfig,
    loadReadingNotes: loadReadingNotes,
    saveReadingNotes: saveReadingNotes,
    loadReadingLog: loadReadingLog,
    saveReadingLog: saveReadingLog,
    loadSpellingNormalized: loadSpellingNormalized,
    saveSpellingNormalized: saveSpellingNormalized,
    loadTranslationDrafts: loadTranslationDrafts,
    saveTranslationDrafts: saveTranslationDrafts,
    recomputeSpellingDerived: recomputeSpellingDerived,
    buildLocalPayload: buildLocalPayload,
    normalizePayload: normalizePayload,
    mergePayloads: mergePayloads,
    markDirty: markDirty,
    sync: sync,
    exportBackup: exportBackup,
    importBackup: importBackup,
    bindSyncUI: bindSyncUI
  };
})(typeof window !== 'undefined' ? window : globalThis);
