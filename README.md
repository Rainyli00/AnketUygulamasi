# Anket Uygulaması

Bu proje, Node.js ve Express ile geliştirilmiş bir anket uygulamasıdır. Kullanıcılar anketlere katılabilir, admin panelinden yeni anketler oluşturulabilir ve sonuçlar görüntülenebilir.

## Özellikler
- Kullanıcılar için anket listesi ve katılım
- Admin paneli ile anket, soru ve seçenek yönetimi
- Sonuç ve istatistik görüntüleme
- IP tabanlı tekrar katılım engelleme
- Oturum yönetimi

## Kurulum
1. Depoyu klonlayın:
   ```
   git clone <repo-url>
   ```
2. Bağımlılıkları yükleyin:
   ```
   npm install
   ```
3. Veritabanı yapısını oluşturun:
   ```
   anketdb.sql dosyasını MySQL'e import edin
   ```
4. Gerekli ayarları yapın (ör. config.js).

## Çalıştırma
```
node index.js
```

## Dizin Yapısı
- `routes/` : Kullanıcı ve admin rotaları
- `views/` : EJS şablonları
- `public/` : Statik dosyalar
- `data/` : Veritabanı bağlantı dosyası


## Katkı
Pull request ve önerilere açıktır.

---
Sorularınız için iletişime geçebilirsiniz.
