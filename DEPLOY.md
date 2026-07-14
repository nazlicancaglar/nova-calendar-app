# Nova Workspace — Deploy Rehberi

iPad + PC'de senkron, kalıcı ve parolalı çalışan PWA. Mimari:

```
iPad / PC (PWA)  →  Vercel (statik frontend)  →  Render (Express backend)  →  Supabase (kalıcı veri)
```

- **Veri kalıcılığı:** Tüm dashboard + design board verisi Supabase'de durur. Render free tier uyuyup uyansa/redeploy olsa bile veri KAYBOLMAZ.
- **Senkron:** Veri sunucuda olduğu için iPad ve PC otomatik aynı veriyi görür.
- **Güvenlik:** Tek ortak parola ile giriş. URL'yi bilen ama parolayı bilmeyen kimse erişemez.

---

## 1. Supabase (kalıcı depolama) — TAMAMLANDI ✅

Zaten kuruldu. Kullanılan tablo (SQL Editor'de bir kez oluşturuldu):

```sql
create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
```

> **Verileri manuel görüntüleme/düzenleme:** Supabase paneli → **Table Editor** → `app_state`.
> Veri `value` sütununda JSON olarak durur (`dashboard` satırı planner, brainstorm, priorities vb. hepsini içerir). Acil düzenleme buradan yapılabilir; günlük kullanım için uygulama arayüzü tercih edilir.

## 2. Render (backend)

1. Render Dashboard → **New → Web Service** → bu GitHub reposunu bağla.
2. Ayarlar `render.yaml`'dan otomatik gelir (build: `npm install --omit=optional`, start: `npm start`, health check: `/api/health`).
3. **Settings → Environment**'ta şu değişkenleri ELLE ekle (repoya commit edilmez):

   | Anahtar | Değer |
   |---|---|
   | `SUPABASE_URL` | `https://nnwswygpyhrqsaquqsdm.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | Supabase service_role secret (`sb_secret_...`) |
   | `APP_PASSWORD` | `Can.112263` (dilediğin zaman değiştir) |
   | `AUTH_SECRET` | **rastgele uzun bir metin** (üret: aşağıya bak) |

   `AUTH_SECRET` için terminalde: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

4. Deploy et. Log'da `Server running` + `[features] Aktif: (yalnızca çekirdek)` görmelisin.
5. Test: `https://<render-url>/api/health` → `{"ok":true}` dönmeli.

## 3. Vercel (frontend)

1. Vercel → **Add New → Project** → aynı repoyu bağla (var olan key/proje kullanılabilir).
2. `vercel.json` hazır: frontend'i statik derler, `/api/*` isteklerini Render backend'e proxy'ler.
3. **Önemli:** `vercel.json` içindeki proxy hedefi `https://nova-backend.onrender.com`. Render URL'in farklıysa `vercel.json`'daki bu satırı güncelle.
4. Deploy et.

## 4. Keep-alive (Render free uyumasın)

Render free ~15 dk hareketsizlikte uyur (sonraki ilk istek ~30-60 sn). Önlemek için:

1. [uptimerobot.com](https://uptimerobot.com) (ücretsiz) → **Add New Monitor**.
2. Type: **HTTP(s)**, URL: `https://<render-url>/api/health`, aralık: **5 dk**.
3. Kaydet. Artık backend uyanık kalır.

## 5. iPad + PC'de kurulum (PWA)

- **iPad (Safari):** Vercel URL'ini aç → Paylaş → **Ana Ekrana Ekle**. Uygulama simgesi tam ekran açılır.
- **PC (Chrome/Edge):** URL'i aç → adres çubuğundaki **Yükle** simgesi → uygulama olarak kurulur.
- İlk açılışta parola sorulur (`Can.112263`), 30 gün hatırlanır.

## Test kontrol listesi

- [ ] PC'de giriş yap, bir görev/planner öğesi ekle.
- [ ] iPad'de aç → aynı veri görünüyor mu?
- [ ] iPad'de değişiklik yap → PC'de yenile → yansıyor mu?
- [ ] Render'ı manuel restart et (Dashboard → Manual Deploy) → veri hâlâ duruyor mu?

## Özellik açmak (opsiyonel, ileride)

Newsletter / OCR / AI / sync kapalı. Açmak için Render env'e `FEATURES=newsletter,ai` gibi ekle
**ve** `render.yaml` build komutundan `--omit=optional`'ı kaldır (native paketler için).
İlgili API anahtarlarını da eklemen gerekir (`.env.example`'a bak).
