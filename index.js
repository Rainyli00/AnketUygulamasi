const express = require('express');
const session = require('express-session'); 
const FileStore = require('session-file-store')(session);
const app = express();
const port = process.env.PORT || 3000;

// IP almak için trust proxy ayarı
app.set('trust proxy', true);

const db = require("./data/db");
console.log("✅ DB modülü yüklendi!");


const usersRouter = require("./routes/users");
console.log("✅ Users modülü yüklendi!");


const adminRouter = require("./routes/admin");
console.log("✅ Admin modülü yüklendi!");

// Statik dosyaları bildiririz
app.use(express.static('public'));

// middleware form kontrolü için
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middlewareidir
app.use(session({
  secret: 'anketproje2025',
  resave: false, 
  saveUninitialized: false, 
  rolling: true, // Her istekte session süresini yeniler
  name: 'anket.sid',
  store: new FileStore({
    path: './sessions',
    ttl: 7200, // 2 saat
    retries: 2,
    logFn: function() {} 
  }),
  cookie: { 
    secure: false,
    maxAge: 2 * 60 * 60 * 1000, // session süresi
    httpOnly: true, // XSS koruma
    sameSite: 'lax' // CSRF koruma
  }
}));

// ejs kullanacağımızı bildiriyoruz
app.set("view engine", "ejs");

// Ana sayfa /users yönlendir
app.get("/", (req, res) => {
  res.redirect("/users");
});

// Rotalar
app.use("/users", usersRouter);
app.use("/admin", adminRouter);

// sunucuyu başlatır
app.listen(port, () => {
  console.log(`Sunucu ${port} portunda çalışıyor...`);
});
