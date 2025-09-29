const mysql = require("mysql2");
const config = require("../config"); 


// MySQL bağlantısını oluşturuyoruz
let connection = mysql.createConnection(config.db);

connection.connect((err) => {
  if (err) {
    console.error("MySQL bağlantısı başarısız:", err);
  } else {
    console.log("MySQL bağlantısı başarılı!");
  }
});

module.exports = connection.promise();