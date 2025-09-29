const express = require('express'); 
const router = express.Router();
const db = require("../data/db");

// IP adresini alma fonksiyonu
function getClientIP(req) {
  // Cloudflare, nginx, apache gibi reverse proxyler için
  return req.headers['cf-connecting-ip'] ||           
         req.headers['x-real-ip'] ||                 
         req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-client-ip'] ||                
         req.headers['x-cluster-client-ip'] ||        
         req.connection.remoteAddress ||              
         req.socket.remoteAddress ||                  
         req.ip ||                                    
         '127.0.0.1';                                
}

// IP kontrolü middleware fonksiyonu
async function ipKontrol(ipAdres, anketId) {
  const [sonuc] = await db.execute(`
    SELECT COUNT(*) as count 
    FROM kullanicilar k
    JOIN cevaplar c ON k.id = c.kullanici_id
    JOIN sorular s ON c.soru_id = s.id
    WHERE k.ip_adres = ? AND s.anket_id = ?
  `, [ipAdres, anketId]);
  const kontrol = sonuc[0].count > 0;
  return kontrol;
}


// Ana sayfa - Anketler listelenir ve anketler başlatılır
router.get("/", async (req, res) => {
  try {
    //
  const hangiSayfa = parseInt(req.query.sayfa) || 1; // url'den sayfa numarası alır (türkçeleştirildi)
  const sayfaboyut = 6; 
  const aramaFiltre = req.query.filtre || ""; // url'den filtre alır (türkçeleştirildi)
  const atlamaSayi = (hangiSayfa - 1) * sayfaboyut; 
    
    
    let sorgu = "SELECT id, baslik, olusturma_tarihi FROM anketler where aktif = 1"; 

    // Eğer kullanıcı arama yapmışsa sorguya bunuda ekler
    if (aramaFiltre) {
      sorgu += " AND baslik LIKE ?"; 
    }
    
    // yeni anketleri getirir ve belirli sayıda anketi atlar ve bunu sorguya ekler
    sorgu += ` ORDER BY id DESC LIMIT ${sayfaboyut} OFFSET ${atlamaSayi}`;
    
    
    // db den anketleri getirir
    const [anketListesi] = await db.execute(sorgu, aramaFiltre ? [`%${aramaFiltre}%`] : []);
    
    // anket sayısı bulunur sayfalama için
    let toplamSayiSorgusu = "SELECT COUNT(*) as total FROM anketler WHERE aktif = 1"; 
    if (aramaFiltre) {
      toplamSayiSorgusu += " AND baslik LIKE ?"; // Arama varsa ona göre sayar
    }
    const [toplamSayiSonucu] = await db.execute(toplamSayiSorgusu, aramaFiltre ? [`%${aramaFiltre}%`] : []);
    const toplamAnketSayisi = toplamSayiSonucu[0].total; 
    const toplamSayfaSayisi = Math.ceil(toplamAnketSayisi / sayfaboyut);
    
    // sonuc gösteririz
    // sorgu ajax isteiği ise anketler kısmını döndür
    if (req.query.ajax) {
      return res.render("anasayfa", { 
        anketler: anketListesi, 
        sayfa: hangiSayfa, 
        toplamSayfa: toplamSayfaSayisi, 
        filtre: aramaFiltre,
        toplamAnket: toplamAnketSayisi
      });
    }

    // sayfayı yükler
    res.render("anasayfa", { 
      anketler: anketListesi, 
      sayfa: hangiSayfa, 
      toplamSayfa: toplamSayfaSayisi, 
      filtre: aramaFiltre,
      toplamAnket: toplamAnketSayisi
    });
  } catch (hata) {
    console.error("Ana sayfa yüklenirken hata:", hata);
    res.send("Hata oluştu - ana sayfa yüklenemedi");
  }
});

// Anketi başlatır
router.get("/anket/:anketId/baslat", async (req, res) => {
  const { anketId } = req.params;
  try {
    
    req.session.ipAdres = getClientIP(req);
    
    // anket sayfasını yönlendirir
    res.redirect(`/users/anket/${anketId}`);
  } catch (err) {
    console.error(err);
    res.send("Hata oluştu");
  }
});

// Anket sayfası
router.get("/anket/:anketId", async (req, res) => {
  const { anketId } = req.params;
  try {
   
  const ipAdres = getClientIP(req);

   if (await ipKontrol(ipAdres, anketId)) {
     return res.render("bilgilendirme", {
       mesaj: "Bu anketi zaten doldurdunuz!",
       altMesaj: "Aynı IP adresinden bir ankete sadece bir kez cevap verilebilir."
     });
   }
// bu  sorgudan rows(veritabanından dönen kayıtlar),fields döner o yüzden sadece rows kısmını alıyoruz
  const [anketRows] = await db.execute("SELECT id, baslik, olusturma_tarihi FROM anketler WHERE id = ?", [anketId]);
  const anket = anketRows[0];
    
    if (!anket) {
      return res.render("404");
    }
    
    const [sorularRows] = await db.execute("SELECT * FROM sorular WHERE anket_id = ?", [anketId]);
    const secenekler = {};
    for (const soru of sorularRows) {
      const [secenekRows] = await db.execute("SELECT * FROM secenekler WHERE soru_id = ?", [soru.id]);
      secenekler[soru.id] = secenekRows;
    }
    res.render("anket", { anket, sorular: sorularRows, secenekler });
  } catch (err) {
    console.error(err);
    res.send("Hata oluştu");
  }
});

// Anket cevaplarını db ye kaydeder ve kullanıcı oluşturur
router.post("/anket/:anketId/cevapla", async (req, res) => {
  const { anketId } = req.params;
  try {

    // IP adresini alır
  const ipAdres = req.session.ipAdres || getClientIP(req);
    
    
if (await ipKontrol(ipAdres, anketId)) {
  return res.render("bilgilendirme", { 
    mesaj: "Bu anketi zaten doldurdunuz!",
    altMesaj: "Aynı IP adresinden bir ankete sadece bir kez cevap verilebilir."
  });
}

    // Zorunlu soruları kontrol et
    const [zorunluSorular] = await db.execute("SELECT id FROM sorular WHERE anket_id = ? AND zorunlu = 1", [anketId]);
    for (const soru of zorunluSorular) {
      const cevap = req.body[`soru_${soru.id}`];
      if (!cevap || cevap.trim() === '') {
        return res.render("bilgilendirme", {
          mesaj: "Eksik Zorunlu Soru!",
          altMesaj: "Lütfen tüm zorunlu soruları cevaplayın."
        });
      }
    }

    // Kullanıcı bilgilerini alır
    let isim = req.body.isim;
    if (!isim || isim.trim() === "") isim = "Ziyaretçi";
    
    const email = req.body.email || null;
    const telefon = req.body.telefon || null;
    const tcKimlik = req.body.tc_kimlik || null;

    // Kullanıcıyı oluşturur ve db ye kaydeder
    const [eklemeSonuc] = await db.execute(
      "INSERT INTO kullanicilar (isim, email, telefon, tc_kimlik, ip_adres) VALUES (?, ?, ?, ?, ?)",
      [isim, email, telefon, tcKimlik, ipAdres]
    );
    const kullaniciId = eklemeSonuc.insertId;
    
    // Soruları çeker ve cevapları db ye kaydeder
    const [sorular] = await db.execute("SELECT id FROM sorular WHERE anket_id = ?", [anketId]);
    for (const soru of sorular) {
      const secenekId = req.body[`soru_${soru.id}`];
      
      // Diğer seçeneği için özel işlem
      let cevapMetni = null;
      let secenekIdKaydet = secenekId;
      
      // Eğer seçilen seçenek "Diğer" ise, text input'taki değeri al
      const [secenekBilgi] = await db.execute("SELECT secenek_metni FROM secenekler WHERE id = ?", [secenekId]);
      if (secenekBilgi.length > 0 && secenekBilgi[0].secenek_metni === 'Diğer') {
        cevapMetni = req.body[`diger_${soru.id}`] || null;
      }
      
      await db.execute(
        "INSERT INTO cevaplar (kullanici_id, soru_id, secenek_id, cevap_metni) VALUES (?, ?, ?, ?)",
        [kullaniciId, soru.id, secenekIdKaydet, cevapMetni]
      );
    }
    
    
    delete req.session.ipAdres;
    // teşekkür ekranını gösterir
    res.render("bilgilendirme", {});
  } catch (err) {
    console.error(err);
    res.send("Cevaplar kaydedilirken hata oluştu");
  }
});

module.exports = router;

