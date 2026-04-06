// _migrate.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbFile = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  // Ignoramos errores por si la columna ya existe
  db.run("ALTER TABLE workers ADD COLUMN role TEXT DEFAULT 'Ayudante'", (err) => {
    if(err) console.log('Workers role:', err.message);
    else console.log('Workers role añadido.');
  });
  db.run("ALTER TABLE work_entries ADD COLUMN is_paid BOOLEAN DEFAULT 0", (err) => {
    if(err) console.log('Entries is_paid:', err.message);
    else console.log('Entries is_paid añadido.');
  });
  db.run("ALTER TABLE advances ADD COLUMN is_paid BOOLEAN DEFAULT 0", (err) => {
    if(err) console.log('Advances is_paid:', err.message);
    else console.log('Advances is_paid añadido.');
  });
});

setTimeout(() => {
  db.close();
  console.log('Migracion manual completa');
}, 1000);
