// admin rotaları
const express = require("express");
const router = express.Router();
const db = require("../data/db");

// Yönetici login middlewarei
function adminKontrol(req, res, next) {
  // Session kontrolü yapılır
  if (!req.session) {
    return res.redirect('/admin/giris');
  }
  
  // Admin giriş bilgilerini konrol edilir
  if (req.session.adminGiris === true && 
      req.session.adminId && 
      req.session.adminKullanici) {
    
    // Login zamanı ve son aktivite kontrolü yapılır
    const simdi = new Date().getTime();
    const loginZamani = req.session.loginTime || simdi;
    const sonAktivite = req.session.lastActivity || loginZamani;
    const maxSessionSüre = 1 * 60 * 60 * 1000; // 1 saat

    // Son aktiviteden itibaren 1 saat geçtiyse sessionı sonlandırır ve sesssionı temizler
    // Ardından login ekranına yönlendirir
    if ((simdi - sonAktivite) > maxSessionSüre) {
      
      req.session.destroy((err) => {
        return res.redirect('/admin/giris');
      });
      return;
    }
    
    // Son aktivite zamanını günceller
    req.session.lastActivity = simdi;
    req.session.touch();
    return next();
  } else {
    // Geçersiz sessionı temizler
    req.session.destroy((err) => {
      return res.redirect('/admin/giris');
    });
  }
}

// Admin login sayfası
router.get("/giris", (req, res) => {
  if (req.session && req.session.adminGiris) {
    return res.redirect('/admin');
  }
  res.render("adminlogin", { hata: null });
});

// Admin login işlemi yapılır dbden kullanıcı adı ve şifre sorgulanır ona göre giriş yapılır.
router.post("/giris", async (req, res) => {
  try {
    const { kullaniciAdi, sifre } = req.body;
    
    if (!kullaniciAdi || !sifre) {
      return res.render("adminlogin", { hata: "Kullanıcı adı ve şifre zorunludur!" });
    }
    
    // Veritabanından admin bilgilerini kontrol eder
    const [adminBilgi] = await db.execute(
      "SELECT * FROM admin WHERE kullanici_adi = ? AND sifre = ?", 
      [kullaniciAdi, sifre]
    );
    
    if (adminBilgi.length == 0) {
      return res.render("adminlogin", { hata: "Kullanıcı adı veya şifre hatalı!" });
    }
    
    const admin = adminBilgi[0];
    
    // Eski sessionı temizler
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate hatası:", err);
        return res.render("adminlogin", { hata: "Giriş işlemi sırasında bir hata oluştu!" });
      }
      
      // Giriş başarılıdır sessiona bilgileri kaydeder
      const currentTime = new Date().getTime();
      req.session.adminGiris = true;
      req.session.adminKullanici = admin.kullanici_adi;
      req.session.adminId = admin.id;
      req.session.adminAdSoyad = admin.ad_soyad;
      req.session.loginTime = currentTime;
      req.session.lastActivity = currentTime; // Son aktivite zamanı
      
      // Sessionı kaydeder
      req.session.save((err) => {
        if (err) {
          console.error("Session kaydetme hatası:", err);
          return res.render("adminlogin", { hata: "Giriş işlemi sırasında bir hata oluştu!" });
        }
        res.redirect('/admin');
      });
    });
  } catch (hata) {
    console.error("Admin giriş hatası:", hata);
    res.render("adminlogin", { hata: "Giriş işlemi sırasında bir hata oluştu!" });
  }
});

// Admin çıkış
router.get("/cikis", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session silinirken hata:", err);
    }
    res.redirect('/admin/giris');
  });
});

// ana admin sayfası  
router.get("/", adminKontrol, async (req, res) => {
  try {
    // veri tabanından sayılar çeker
    const [anketSayisi] = await db.execute("SELECT COUNT(*) as toplam FROM anketler");
    const [kullaniciSayisi] = await db.execute("SELECT COUNT(*) as toplam FROM kullanicilar");
    const [cevapSayisi] = await db.execute("SELECT COUNT(*) as toplam FROM cevaplar");

    const toplamAnketSayi = anketSayisi[0].toplam;
    const toplamKullaniciSayi = kullaniciSayisi[0].toplam;
    const toplamCevapSayi = cevapSayisi[0].toplam;

    // Son 24 saatteki aktiviteleri getirir
    const [sonAnketler] = await db.execute(
      "SELECT COUNT(*) as yeni_anket FROM anketler WHERE olusturma_tarihi >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );
    
    const [sonKullanicilar] = await db.execute(
      "SELECT COUNT(*) as yeni_kullanici FROM kullanicilar WHERE kayit_tarihi >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );
    
    const [sonCevaplar] = await db.execute(
      "SELECT COUNT(*) as yeni_cevap FROM cevaplar WHERE cevap_tarihi >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );

    // Son işlemler verilerini obje olarak alırız
    const sonIslemler = {
      yeniAnketSayi: sonAnketler[0].yeni_anket,
      yeniKullaniciSayi: sonKullanicilar[0].yeni_kullanici,
      yeniCevapSayi: sonCevaplar[0].yeni_cevap
    };

    // Admin bilgilerini session dan alır
    const adminBilgi = {
      kullaniciAdi: req.session.adminKullanici,
      adSoyad: req.session.adminAdSoyad
    };

    res.render("adminana", { 
      toplamAnketSayi, 
      toplamKullaniciSayi, 
      toplamCevapSayi,
      adminBilgi,
      sonIslemler
    });
  } catch (hata) {
    console.error("Dashboard yüklenirken hata oluştu:", hata);
    res.send("Dashboard yüklenemedi!!");
  }
});

// Anket yönetimi sayfası
router.get("/anketler", adminKontrol, async (req, res) => {
  try {
    const sayfa = parseInt(req.query.sayfa) || 1; 
    const sayfaBasinaAnket = 6; // Her sayfada kaç anket gösterilecek
    const atlamaDeger = (sayfa - 1) * sayfaBasinaAnket;
    
    // Filtre parametreleri
    const arama = req.query.arama || '';
    const durum = req.query.durum || 'tumu'; 
    const siralama = req.query.siralama || 'yeni'; 
    
   
    let wheres = 'WHERE 1=1';
    let whereParametreler = [];
    
    // Arama filtresi
    if (arama.trim() !== '') {
      wheres += ' AND baslik LIKE ?';
      whereParametreler.push(`%${arama.trim()}%`);
    }
    
    // Durum filtresi
    if (durum === 'aktif') {
      wheres += ' AND aktif = 1';
    } else if (durum === 'pasif') {
      wheres += ' AND aktif = 0';
    }
    
    // Sıralama
    let orders = '';
    switch (siralama) {
      case 'eski':
        orders = 'ORDER BY olusturma_tarihi ASC, id ASC';
        break;
      case 'alfabetik':
        orders = 'ORDER BY baslik ASC';
        break;
      default: // 'yeni'
        orders = 'ORDER BY olusturma_tarihi DESC, id DESC';
        break;
    }
    
    // Toplam anket sayısını getirir filtreli şekilde
    const toplamQuery = `SELECT COUNT(*) as toplam FROM anketler ${wheres}`;
    const [toplamSonuc] = await db.execute(toplamQuery, whereParametreler);
    const toplamAnket = toplamSonuc[0].toplam;
    const toplamSayfa = Math.ceil(toplamAnket / sayfaBasinaAnket);
    
    // Mevcut sayfa için anketleri getirir filtreli şekilde
    const anketQuery = `SELECT * FROM anketler ${wheres} ${orders} LIMIT ${parseInt(sayfaBasinaAnket)} OFFSET ${parseInt(atlamaDeger)}`;
    const [anketler] = await db.execute(anketQuery, whereParametreler);
    
    res.render("adminanket", { 
      anketler,
      mevcutSayfa: sayfa,
      toplamSayfa,
      toplamAnket,
      sayfaBasinaAnket,
      arama,
      durum,
      siralama
    });
  } catch (hata) {
    console.error("Anket sayfası yüklenirken hata:", hata);
    res.send("Anket sayfası yüklenemedi");
  }
});

// Yeni anket oluşturma formu sayfası db ye kaydeder
router.get("/yeniAnket", adminKontrol, (req, res) => {
  
  const anket = { id: 'yeni', baslik: '' };
  const sorular = [];
  const secenekler = {};
  
  res.render("anketdetay", { anket, sorular, secenekler, yeniAnket: true });
});

// Yeni anket oluşturur verilerle beraber
router.post("/yeniAnket", adminKontrol, async (req, res) => {
  try {
    const { anketBaslik, anketAktif, sorular } = req.body;
    
    if (!anketBaslik || anketBaslik.trim() === "") {
      return res.redirect("/admin/yeniAnket?hata=baslik-bos");
    }
    
    if (!sorular || sorular.length === 0) {
      return res.redirect("/admin/yeniAnket?hata=soru-yok");
    }
    
    // Anketi oluşturur ve db ye kaydeder
    const [anketSonuc] = await db.execute(
      "INSERT INTO anketler (baslik, aktif, olusturma_tarihi) VALUES (?, ?, NOW())", 
      [anketBaslik.trim(), anketAktif === '1' ? 1 : 0]
    );
    const anketId = anketSonuc.insertId;
    
    // Soruları ekler ve db ye kaydeder
    for (let i = 0; i < sorular.length; i++) {
      const soru = sorular[i];
      if (soru.soruMetni && soru.soruMetni.trim() !== "") {
        const soruZorunlu = soru.zorunlu === '1' ? 1 : 0; 
        const [soruSonuc] = await db.execute(
          "INSERT INTO sorular (anket_id, soru_metni, zorunlu) VALUES (?, ?, ?)", 
          [anketId, soru.soruMetni.trim(), soruZorunlu]
        );
        const soruId = soruSonuc.insertId;
        
        // soruya göre seçenekleri ekler ve db ye kaydeder
        if (soru.secenekler && soru.secenekler.length > 0) {
          for (const secenek of soru.secenekler) {
            if (secenek && secenek.trim() !== "") {
              await db.execute(
                "INSERT INTO secenekler (soru_id, secenek_metni) VALUES (?, ?)",
                [soruId, secenek.trim()]
              );
            }
          }
        }
      }
    }
    
    res.redirect("/admin/anketler?basari=anket-olusturuldu");
    
  } catch (hata) {
    console.error("Anket oluşturulurken hata:", hata);
    res.redirect("/admin/yeniAnket?hata=veritabani");
  }
});

// Anket siler ve db de de siler
router.post("/anketSil/:id", adminKontrol, async (req, res) => {
  try {
    const anketId = req.params.id;
    
    // ilişkiyi bozmamak için sıra ile sileriz
    await db.execute("DELETE FROM cevaplar WHERE soru_id IN (SELECT id FROM sorular WHERE anket_id = ?)", [anketId]);
    await db.execute("DELETE FROM secenekler WHERE soru_id IN (SELECT id FROM sorular WHERE anket_id = ?)", [anketId]);
    await db.execute("DELETE FROM sorular WHERE anket_id = ?", [anketId]);
    await db.execute("DELETE FROM anketler WHERE id = ?", [anketId]);
    
    res.redirect("/admin/anketler?basari=anket-silindi");
  } catch (hata) {
    console.error("Anket silinirken hata:", hata);
    res.redirect("/admin/anketler?hata=silme-hatasi");
  }
});

// Anketi düzenler ve db ye kaydeder
router.post("/anketDuzenle/:id", adminKontrol, async (req, res) => {
  try {
    const anketId = req.params.id;
    const { baslik } = req.body;
    
    if (!baslik || baslik.trim() === "") {
      return res.redirect("/admin/anketler?hata=baslik-bos");
    }
    
    await db.execute("UPDATE anketler SET baslik = ? WHERE id = ?", [baslik.trim(), anketId]);
    res.redirect("/admin/anketler?basari=anket-guncellendi");
  } catch (hata) {
    console.error("Anket güncellenirken hata:", hata);
    res.redirect("/admin/anketler?hata=guncelleme-hatasi"); // hata mesaj fırlatır
  }
});

// Anket detay sayfasıdır düzenleme yapılır 
router.get("/anket/:id", adminKontrol, async (req, res) => {
  try {
    const anketId = req.params.id;
    
    // Anket bilgisini çeker
    const [anketBilgi] = await db.execute("SELECT * FROM anketler WHERE id = ?", [anketId]);
    if (anketBilgi.length === 0) {
      return res.redirect("/admin/anketler?hata=anket-bulunamadi");
    }
    
    // Soruları ve seçenekleri çeker
    const [sorular] = await db.execute("SELECT * FROM sorular WHERE anket_id = ? ORDER BY id", [anketId]);
    
    const secenekler = {};
    for (const soru of sorular) {
      const [soruSecenekleri] = await db.execute("SELECT * FROM secenekler WHERE soru_id = ? ORDER BY id", [soru.id]);
      secenekler[soru.id] = soruSecenekleri;
    }
    
    res.render("anketdetay", { 
      anket: anketBilgi[0], 
      sorular, 
      secenekler 
    });
  } catch (hata) {
    console.error("Anket detay sayfası yüklenirken hata:", hata);
    res.redirect("/admin/anketler?hata=detay-yuklenemedi");
  }
});

// Yeni soru ekler ve dbye kaydeder
router.post("/anket/:id/soru", adminKontrol, async (req, res) => {
  try {
    const anketId = req.params.id;
    const { soruMetni } = req.body;
    
    if (!soruMetni || soruMetni.trim() === "") {
      return res.redirect(`/admin/anket/${anketId}?hata=soru-bos`);
    }
    
    await db.execute("INSERT INTO sorular (anket_id, soru_metni) VALUES (?, ?)", [anketId, soruMetni.trim()]);
    res.redirect(`/admin/anket/${anketId}?basari=soru-eklendi`);
  } catch (hata) {
    console.error("Soru eklenirken hata:", hata);
    res.redirect(`/admin/anket/${req.params.id}?hata=soru-ekleme-hatasi`);
  }
});


// anket id sine göre soruyu siler ve db dede siler
router.post("/soru/:id/sil", adminKontrol, async (req, res) => {
  try {
    const soruId = req.params.id;
    
    
    const [soruBilgi] = await db.execute("SELECT anket_id FROM sorular WHERE id = ?", [soruId]);
    if (soruBilgi.length === 0) {
      return res.redirect("/admin/anketler?hata=soru-bulunamadi");
    }
    const anketId = soruBilgi[0].anket_id;
    
    // ilişkiye göre sırayla siler
    await db.execute("DELETE FROM cevaplar WHERE soru_id = ?", [soruId]);
    await db.execute("DELETE FROM secenekler WHERE soru_id = ?", [soruId]);
    await db.execute("DELETE FROM sorular WHERE id = ?", [soruId]);
    
    res.redirect(`/admin/anket/${anketId}?basari=soru-silindi`);
  } catch (hata) {
    console.error("Soru silinirken hata:", hata);
    res.redirect("/admin/anketler?hata=soru-silme-hatasi");
  }
});

// soruya göre seçenek ekler ve dbye kaydeder
router.post("/soru/:id/secenek", adminKontrol, async (req, res) => {
  try {
    const soruId = req.params.id;
    const { secenekMetni } = req.body;
    
    if (!secenekMetni || secenekMetni.trim() === "") {
      const [soruBilgi] = await db.execute("SELECT anket_id FROM sorular WHERE id = ?", [soruId]);
      return res.redirect(`/admin/anket/${soruBilgi[0].anket_id}?hata=secenek-bos`);
    }
    
    await db.execute("INSERT INTO secenekler (soru_id, secenek_metni) VALUES (?, ?)", [soruId, secenekMetni.trim()]);
    
    const [soruBilgi] = await db.execute("SELECT anket_id FROM sorular WHERE id = ?", [soruId]);
    res.redirect(`/admin/anket/${soruBilgi[0].anket_id}?basari=secenek-eklendi`);
  } catch (hata) {
    console.error("Seçenek eklenirken hata:", hata);
    res.redirect("/admin/anketler?hata=secenek-ekleme-hatasi");
  }
});

// Seçenek siler ve dbye kaydeder
router.post("/secenek/:id/sil", adminKontrol, async (req, res) => {
  try {
    const secenekId = req.params.id;
    
    // Anket ID'sini al
    const [secenekBilgi] = await db.execute(`
      SELECT s.anket_id 
      FROM secenekler se 
      JOIN sorular s ON se.soru_id = s.id 
      WHERE se.id = ?
    `, [secenekId]);
    
    if (secenekBilgi.length === 0) {
      return res.redirect("/admin/anketler?hata=secenek-bulunamadi");
    }
    const anketId = secenekBilgi[0].anket_id;
    
    // ilişkiye görede siler
    await db.execute("DELETE FROM cevaplar WHERE secenek_id = ?", [secenekId]);
    await db.execute("DELETE FROM secenekler WHERE id = ?", [secenekId]);
    
    res.redirect(`/admin/anket/${anketId}?basari=secenek-silindi`);
  } catch (hata) {
    console.error("Seçenek silinirken hata:", hata);
    res.redirect("/admin/anketler?hata=secenek-silme-hatasi");
  }
});

// Anket aktivliğini ayarlar ve dbye kaydeder
router.post("/anket/:id/ayarlar", adminKontrol, async (req, res) => {
  try {
    const anketId = req.params.id;
    const { aktif } = req.body;
    
    await db.execute(
      "UPDATE anketler SET aktif = ? WHERE id = ?", 
      [aktif === '1' ? 1 : 0, anketId]
    );
    
    res.redirect(`/admin/anket/${anketId}?basari=ayarlar-guncellendi`);
  } catch (hata) {
    console.error("Anket ayarları güncellenirken hata:", hata);
    res.redirect(`/admin/anket/${req.params.id}?hata=ayar-guncelleme-hatasi`);
  }
});


// Soruya cevap verip vermeme zorunluğunu değiştirir ve dbye kaydeder
router.post("/soru/:id/zorunlu", adminKontrol, async (req, res) => {
  try {
    const soruId = req.params.id;
    const { zorunlu } = req.body;
    
  
    const [soruBilgi] = await db.execute("SELECT anket_id FROM sorular WHERE id = ?", [soruId]);
    if (soruBilgi.length === 0) {
      return res.redirect("/admin/anketler?hata=soru-bulunamadi");
    }
    const anketId = soruBilgi[0].anket_id;
    
    await db.execute("UPDATE sorular SET zorunlu = ? WHERE id = ?", [zorunlu === '1' ? 1 : 0, soruId]);
    
    res.redirect(`/admin/anket/${anketId}?basari=soru-guncellendi`);
  } catch (hata) {
    console.error("Soru zorunluluğu güncellenirken hata:", hata);
    res.redirect("/admin/anketler?hata=soru-guncelleme-hatasi");
  }
});


// Kullanıcı cevapları sayfasıdır.  buradan kullanıcıların anketlere verdiği cevaplar görüntülenir
router.get("/kullaniciCevap", adminKontrol, async (req, res) => {
  try {
    const sayfa = parseInt(req.query.sayfa) || 1;
    const sayfaBasinaKayit = 15; 
    const offset = (sayfa - 1) * sayfaBasinaKayit;
    
    // Filtre parametreleridir.
    const aramaIsim = req.query.aramaIsim || '';
    const aramaIP = req.query.aramaIP || '';
    const aramaAnket = req.query.aramaAnket || '';
    const siralama = req.query.siralama || 'yeni'; 
    
    // sorgu için parametreler tanımlanır
    let whereClause = 'WHERE 1=1';
    let whereParams = [];
    
    // filtreleme aramaları yaoılır
   
    if (aramaIsim.trim() !== '') {
      whereClause += ' AND k.isim LIKE ?';
      whereParams.push(`%${aramaIsim.trim()}%`);
    }
    
 
    if (aramaIP.trim() !== '') {
      whereClause += ' AND k.ip_adres LIKE ?';
      whereParams.push(`%${aramaIP.trim()}%`);
    }
    
    
    if (aramaAnket.trim() !== '') {
      whereClause += ' AND a.baslik LIKE ?';
      whereParams.push(`%${aramaAnket.trim()}%`);
    }
    
    // sorguya sıralama parametreleride eklenir
    let orderClause = '';
    switch (siralama) {
      case 'eski':
        orderClause = 'ORDER BY c.cevap_tarihi ASC';
        break;
      case 'isim':
        orderClause = 'ORDER BY k.isim ASC, c.cevap_tarihi DESC';
        break;
      case 'anket':
        orderClause = 'ORDER BY a.baslik ASC, c.cevap_tarihi DESC';
        break;
      default: 
        orderClause = 'ORDER BY c.cevap_tarihi DESC';
        break;
    }
    
    // Toplam kayıt sayısını verir filtreli bir şekilde
    const toplamQuery = `
      SELECT COUNT(*) as toplam 
      FROM cevaplar c
      JOIN kullanicilar k ON c.kullanici_id = k.id
      JOIN sorular s ON c.soru_id = s.id
      JOIN anketler a ON s.anket_id = a.id
      LEFT JOIN secenekler se ON c.secenek_id = se.id
      ${whereClause}
    `;
    const [toplamSonuc] = await db.execute(toplamQuery, whereParams);
    const toplamKayit = toplamSonuc[0].toplam;
    const toplamSayfa = Math.ceil(toplamKayit / sayfaBasinaKayit);
    
    // kullanıcı cevaplarını getirir filtreli ve sayfalı bir şekilde
    const anaQuery = `
      SELECT 
        k.id as kullanici_id,
        k.isim, k.email, k.telefon, k.tc_kimlik, k.ip_adres, k.kayit_tarihi,
        a.id as anket_id, a.baslik as anket_baslik,
        s.soru_metni,
        se.secenek_metni,
        c.cevap_metni,
        c.cevap_tarihi
      FROM cevaplar c
      JOIN kullanicilar k ON c.kullanici_id = k.id
      JOIN sorular s ON c.soru_id = s.id
      JOIN anketler a ON s.anket_id = a.id
      LEFT JOIN secenekler se ON c.secenek_id = se.id
      ${whereClause}
      ${orderClause}
      LIMIT ${parseInt(sayfaBasinaKayit)} OFFSET ${parseInt(offset)}
    `;
    
    const [kullaniciCevaplari] = await db.execute(anaQuery, whereParams);
    
    // Anket listesini db den çeker
    const [anketListesi] = await db.execute("SELECT id, baslik FROM anketler ORDER BY baslik ASC");
    
    res.render("admincevap", { 
      kullaniciCevaplari,
      anketListesi,
      mevcutSayfa: sayfa,
      toplamSayfa,
      toplamKayit,
      sayfaBasinaKayit,
      aramaIsim,
      aramaIP,
      aramaAnket,
      siralama
    });
  } catch (hata) {
    console.error("Kullanıcı cevapları yüklenirken hata:", hata);
    res.send("Kullanıcı cevapları yüklenemedi");
  }
});



// kullanıcıların verdikleri cevaba göre anket istatistiklerini gösterir
router.get("/anketIstatistik", adminKontrol, async (req, res) => {
  try {
   
    
    // sayfalama yapar
    const sayfa = parseInt(req.query.sayfa) || 1;
    const Sayfalimit = 5;
    const atlamaDegeri = (sayfa - 1) * Sayfalimit;
    
    // Filtre parametlerini alır 
    const arama = req.query.arama || '';
    const durum = req.query.durum || ''; 
  
    
    // db den genel toplam sayıları alır ve istatistik olarak gösterir
    const [genelStats] = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM anketler) as toplamAnket,
        (SELECT COUNT(*) FROM anketler WHERE aktif = 1) as aktifAnket,
        (SELECT COUNT(*) FROM kullanicilar) as toplamKullanici,
        (SELECT COUNT(*) FROM cevaplar) as toplamCevap
    `);

    // Filtre koşullarıdır
    let whereCondition = "WHERE 1=1";
    let queryParams = [];

    // Arama filtresidir
    if (arama && arama.trim() !== '') {
      whereCondition += " AND a.baslik LIKE ?";
      queryParams.push(`%${arama.trim()}%`);
      
    }
    // Durum filtresidir
    if (durum === 'aktif') {
      whereCondition += " AND a.aktif = 1";
     
    } else if (durum === 'pasif') {
      whereCondition += " AND a.aktif = 0";
      
    }
    
   
    // Toplam anket sayısını çeker filtreli bir şekilde
    const [toplamQuery] = await db.execute(`
      SELECT COUNT(DISTINCT a.id) as toplam
      FROM anketler a
      ${whereCondition}
    `, queryParams);
    
    const toplamAnket = toplamQuery[0].toplam;
    const toplamSayfa = Math.ceil(toplamAnket / Sayfalimit);


    
    const anketQuery = `
      SELECT 
        a.id,
        a.baslik,
        a.olusturma_tarihi,
        a.aktif
      FROM anketler a
      ${whereCondition}
      ORDER BY a.olusturma_tarihi DESC
      LIMIT ${Sayfalimit} OFFSET ${atlamaDegeri}
    `;
    
    
    const [anketStats] = await db.execute(anketQuery, queryParams);
    
    // Her anket için katılımcı ve cevap sayılarını ayrı ayrı hesaplar
    for (let anket of anketStats) {
      const [katilimciSayisi] = await db.execute(`
        SELECT COUNT(DISTINCT c.kullanici_id) as katilimci_sayisi
        FROM sorular s
        LEFT JOIN cevaplar c ON s.id = c.soru_id
        WHERE s.anket_id = ?
      `, [anket.id]);
      
      const [toplamCevap] = await db.execute(`
        SELECT COUNT(c.id) as toplam_cevap
        FROM sorular s
        LEFT JOIN cevaplar c ON s.id = c.soru_id
        WHERE s.anket_id = ?
      `, [anket.id]);
      
      anket.katilimci_sayisi = katilimciSayisi[0].katilimci_sayisi || 0;
      anket.toplam_cevap = toplamCevap[0].toplam_cevap || 0;
    }

    // Her anket için soru ve seçenekleri db den alır
    for (let anket of anketStats) {
      const [sorular] = await db.execute(`
        SELECT 
          s.id as soru_id,
          s.soru_metni
        FROM sorular s
        WHERE s.anket_id = ?
        ORDER BY s.id
      `, [anket.id]);

      for (let soru of sorular) {
        const [secenekler] = await db.execute(`
          SELECT 
            se.id as secenek_id,
            se.secenek_metni,
            COUNT(c.id) as secim_sayisi,
            ROUND(
              (COUNT(c.id) * 100.0) / NULLIF(
                (SELECT COUNT(*) FROM cevaplar c2 
                 JOIN secenekler se2 ON c2.secenek_id = se2.id 
                 WHERE se2.soru_id = ?), 0
              ), 1
            ) as yuzde
          FROM secenekler se
          LEFT JOIN cevaplar c ON se.id = c.secenek_id
          WHERE se.soru_id = ?
          GROUP BY se.id, se.secenek_metni
          ORDER BY secim_sayisi DESC
        `, [soru.soru_id, soru.soru_id]);

        soru.secenekler = secenekler;
      }

      anket.sorular = sorular;
    }

    res.render("administatistik", {
      genelIstatistikler: genelStats[0],
      anketIstatistikleri: anketStats,
      pagination: {
        mevcutSayfa: sayfa,
        toplamSayfa: toplamSayfa,
        toplamAnket: toplamAnket,
        limit: Sayfalimit
      },
      filtreler: {
        arama: arama,
        durum: durum
      }
    });

  } catch (hata) {
    console.error("İstatistikler alınırken hata:", hata);
    res.redirect("/admin?hata=istatistik-hatasi");
  }
});

// bu get ler dışında bi yere giderse 404 hatasını gösterir
router.use((req, res) => {
  res.status(404).render("404");
});

module.exports = router;