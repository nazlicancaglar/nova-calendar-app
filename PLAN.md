# Pi Terminal Coding Agent Kurulum Planı

## Amaç
Her bilgisayarda anında çalışabilen, taşınabilir (portable), ücretsiz web araması yapabilen ve OpenRouter kullanan bir `@earendil-works/pi-coding-agent` (Pi) çalışma alanı (workspace) oluşturmak.

## Temel Kararlar
1. **Çalışma Alanı (Workspace):** Proje `C:\Users\Sabit Can Caglar\Desktop\nova-content-creation` dizininde konumlandırılacak.
2. **Paket Yönetimi:** Proje, bir `package.json` ile yönetilecek. Böylece her bilgisayarda sadece `npm install` komutuyla bağımlılıklar yüklenebilecek.
3. **OpenRouter Entegrasyonu:** `dotenv-cli` paketi kullanılarak projenin kök dizinindeki `.env` dosyasından `OPENROUTER_API_KEY` güvenli ve taşınabilir bir şekilde okunacak (örn. `npm run agent` komutu ile Pi başlatılacak).
4. **Ücretsiz Web Search Yeteneği (Skill):** `pi-skills` yapısına uygun olarak, tamamen ücretsiz ve API key gerektirmeyen bir web arama yeteneği eklenecek.
   - **Teknoloji:** Node.js tabanlı, ücretsiz tarama imkanı sunan `googlethis` veya `duck-duck-scrape` NPM paketlerinden biri kullanılarak `skills/free-web-search` adında özel bir skill klasörü ve scripti oluşturulacak.
   - Bu skill `SKILL.md` dosyasıyla belgelenip Pi'ye tanıtılacak.

## Sonraki Adımlar (Geliştirme Planı)
1. `nova-content-creation` içinde `package.json` dosyasını oluşturup gerekli kütüphaneleri (`dotenv-cli`, `googlethis`, `dompurify`, `@earendil-works/pi-coding-agent` vs.) eklemek.
2. `.env.example` dosyasını oluşturarak OpenRouter anahtarının nereye yazılacağını göstermek.
3. Proje içerisine `skills/free-web-search` dizini açıp arama komutunu (`search.js`) ve yetenek açıklamasını (`SKILL.md`) kodlamak.
4. Pi'yi bu workspace içerisinde `npm run start` diyerek kolayca başlatabilmek için `package.json` script'lerini yapılandırmak.

> **Kullanıcı Onayı Bekleniyor:**
> Yukarıdaki plan doğrultusunda `package.json`, `.env.example` ve tamamen ücretsiz web search skill'ini oluşturmaya başlayabilir miyim? Onayınızın ardından değişiklikleri yapacağım.
