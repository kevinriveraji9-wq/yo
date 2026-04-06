const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbFile = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(dbFile);

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.log("❌ Uso incorrecto.");
  console.log("👉 Por favor ejecuta: node addUser.js <nombre_usuario> <contraseña>");
  process.exit(1);
}

async function addCustomUser() {
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          console.log(`⚠️ El usuario "${username}" ya existe en la base de datos.`);
        } else {
          console.error("❌ Error al insertar en la base de datos:", err.message);
        }
      } else {
        console.log(`✅ ¡Usuario "${username}" creado exitosamente!`);
      }
      db.close();
    });
  } catch (error) {
    console.error("❌ Error encriptando la contraseña:", error);
    db.close();
  }
}

addCustomUser();
