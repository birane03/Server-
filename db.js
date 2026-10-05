// db.js — Base de données SQLite via le module natif de Node.js (node:sqlite).
// Aucune compilation native requise, contrairement à better-sqlite3 (évite les problèmes
// de Python/Visual Studio manquants sous Windows).
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "dap.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT,
  email TEXT,
  notes TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  has_unpriced INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'À confirmer',
  channel TEXT,
  wave_session_id TEXT,
  wave_transaction_id TEXT
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  format TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_ref ON orders(ref);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`);

// Petit utilitaire de transaction manuelle (node:sqlite n'a pas l'aide db.transaction()
// de better-sqlite3, on la recrée avec BEGIN/COMMIT/ROLLBACK).
db.transaction = function (fn) {
  return function (...args) {
    db.exec("BEGIN");
    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
};

module.exports = db;
