// routes/orders.js — Réception des commandes envoyées depuis le site public
const express = require("express");
const router = express.Router();
const db = require("../db");

function genRef() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `CMD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

router.post("/", (req, res) => {
  const { name, phone, address, city, email, notes, items, total, hasUnpriced, channel } = req.body;
  if (!name || !phone || !address || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: "Champs requis manquants." });
  }
  const ref = genRef();
  const insertOrder = db.prepare(`
    INSERT INTO orders (ref, created_at, name, phone, address, city, email, notes, total, has_unpriced, status, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertItem = db.prepare(`INSERT INTO order_items (order_id, name, brand, format, qty, price) VALUES (?, ?, ?, ?, ?, ?)`);

  const tx = db.transaction(() => {
    const info = insertOrder.run(
      ref, new Date().toISOString(), name, phone, address,
      city || "", email || "", notes || "",
      total || 0, hasUnpriced ? 1 : 0,
      "À confirmer", channel || "Site"
    );
    items.forEach((it) => insertItem.run(info.lastInsertRowid, it.name, it.brand || "", it.format || "", it.qty || 1, it.price || 0));
  });

  try { tx(); res.json({ ok: true, ref }); }
  catch (err) { console.error(err); res.status(500).json({ ok: false, error: "Erreur serveur." }); }
});

module.exports = router;
