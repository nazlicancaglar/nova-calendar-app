/**
 * storage.js
 *
 * Kalıcı key-value depolama. Uygulamanın "dashboard" ve "designBoard" gibi
 * büyük JSON durumlarını tutar.
 *
 * İki mod:
 *  - Supabase modu (SUPABASE_URL + SUPABASE_SERVICE_KEY env varsa):
 *    veri Supabase'deki `app_state (key text pk, value jsonb, updated_at)`
 *    tablosunda kalıcı olarak durur. Render free tier diskini sıfırlasa da
 *    veri kaybolmaz.
 *  - Dosya modu (env yoksa, lokal geliştirme): eski davranış — JSON dosyaları.
 *
 * Tasarım: server.js'teki route'ların çoğu senkron `getDashboardData()` /
 * `writeFileSync(...)` imzalarına dayanıyor. Bunları async'e çevirmek yerine
 * bir write-through cache kullanıyoruz:
 *   - startup'ta init() ile tüm state bir kez Supabase'den belleğe yüklenir.
 *   - get(key) bellekten SENKRON döner.
 *   - set(key, value) belleği günceller ve arka planda Supabase'e flush eder
 *     (dosya moduysa dosyaya yazar). Çağıran beklemek zorunda değil.
 * Böylece server.js'te imza değişikliği minimum olur.
 */

const fs = require('fs');
const path = require('path');

const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

// Dosya modu için: key -> dosya yolu eşlemesi
const FILE_PATHS = {
  dashboard: path.join(__dirname, '..', 'dashboard-cache.json'),
  designBoard: path.join(__dirname, '..', 'design-board.json'),
};

const TABLE = 'app_state';

let supabase = null;
if (USE_SUPABASE) {
  // Bağımlılığı sadece gerçekten kullanılacaksa yükle (lokal geliştirmede
  // paket kurulu olmasa bile dosya modu çalışsın).
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// Bellekteki write-through cache: key -> parsed JSON value (veya undefined)
const cache = new Map();
let initialized = false;

// ── Yükleme yardımcıları ────────────────────────────────────────────────────

async function loadFromSupabase(key) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    console.error(`[storage] Supabase load error for "${key}":`, error.message);
    return undefined;
  }
  return data ? data.value : undefined;
}

function loadFromFile(key) {
  const p = FILE_PATHS[key];
  if (!p || !fs.existsSync(p)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`[storage] File read error for "${key}" (${p}):`, e.message);
    return undefined;
  }
}

// ── Flush (yazma) yardımcıları ──────────────────────────────────────────────

async function flushToSupabase(key, value) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) {
    console.error(`[storage] Supabase flush error for "${key}":`, error.message);
  }
}

function flushToFile(key, value) {
  const p = FILE_PATHS[key];
  if (!p) {
    console.error(`[storage] No file path mapping for key "${key}"`);
    return;
  }
  try {
    // designBoard base64 görsel içerir; okunabilirlik önemli değil, boyut önemli.
    const pretty = key === 'designBoard' ? JSON.stringify(value) : JSON.stringify(value, null, 2);
    fs.writeFileSync(p, pretty, 'utf8');
  } catch (e) {
    console.error(`[storage] File write error for "${key}" (${p}):`, e.message);
  }
}

// ── Genel API ───────────────────────────────────────────────────────────────

/**
 * Startup'ta çağrılır. Bilinen tüm key'leri belleğe yükler.
 * server.js'te ilk route trafiğinden önce await edilmeli.
 */
async function init() {
  if (initialized) return;
  const keys = Object.keys(FILE_PATHS);
  for (const key of keys) {
    let value;
    if (USE_SUPABASE) {
      value = await loadFromSupabase(key);
      // Supabase boşsa ama lokal dosya varsa (ilk deploy migrasyonu),
      // dosyadan yükleyip Supabase'e tohumla.
      if (value === undefined) {
        const fileVal = loadFromFile(key);
        if (fileVal !== undefined) {
          value = fileVal;
          await flushToSupabase(key, value);
          console.log(`[storage] Seeded "${key}" into Supabase from local file`);
        }
      }
    } else {
      value = loadFromFile(key);
    }
    if (value !== undefined) cache.set(key, value);
  }
  initialized = true;
  console.log(`[storage] Initialized in ${USE_SUPABASE ? 'Supabase' : 'file'} mode. Loaded keys: [${[...cache.keys()].join(', ')}]`);
}

/**
 * Senkron oku. init() çağrılmış olmalı. Yoksa undefined döner.
 */
function get(key) {
  return cache.get(key);
}

/**
 * Belleği günceller ve arka planda kalıcı depoya flush eder (fire-and-forget).
 * Çağıranın await etmesi gerekmez; senkron writeFileSync ile davranış eşdeğeri.
 */
function set(key, value) {
  cache.set(key, value);
  if (USE_SUPABASE) {
    // Fire-and-forget; hata loglanır. Ard arda yazmalar en son değeri kazanır.
    flushToSupabase(key, value).catch((e) =>
      console.error(`[storage] async flush failed for "${key}":`, e.message)
    );
  } else {
    flushToFile(key, value);
  }
}

module.exports = { init, get, set, USE_SUPABASE };
