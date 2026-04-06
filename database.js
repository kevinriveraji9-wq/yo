// backend/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbFile = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
  if (!err) {
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA busy_timeout = 5000;');
    db.run('PRAGMA foreign_keys = ON;');
  }
});

/**
 * Ejecuta el contenido de un archivo .sql
 */
function runSqlFile(filePath) {
  return new Promise((resolve, reject) => {
    const sql = fs.readFileSync(filePath, 'utf8');
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { db, runSqlFile };
