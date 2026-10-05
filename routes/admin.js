// routes/admin.js — Espace admin protégé : connexion, commandes, stats, factures PDF
const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const db = require("../db");
const { generateInvoicePDF } = require("../invoice");

const COMPANY = {
  name: "D.A.P — Distribution Agro-Alimentaire Plus SARL",
  address: process.env.COMPANY_ADDRESS || "Zone industrielle, ICS — Sénégal",
  phone: process.env.COMPANY_PHONE || "33 834 86 87",
  email: process.env.COMPANY_EMAIL || "info@dapsarl.com",
  ninea: process.env.COMPANY_NINEA || "NINEA XXXXXXXX",
};

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ ok: false, error: "Non authentifié." });
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME;
  const validHash = process.env.ADMIN_PASSWORD_HASH;
  if (!validUser || !validHash) return res.status(500).json({ ok: false, error: "Identifiants admin non configurés." });
  if (username !== validUser) return res.status(401).json({ ok: false, error: "Identifiants incorrects." });
  const match = await bcrypt.compare(password || "", validHash);
  if (!match) return res.status(401).json({ ok: false, error: "Identifiants incorrects." });
  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post("/logout", (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
router.get("/me", (req, res) => res.json({ ok: true, isAdmin: !!(req.session && req.session.isAdmin) }));

router.get("/orders", requireAuth, (req, res) => {
  const { search, status } = req.query;
  let query = "SELECT * FROM orders WHERE 1=1";
  const params = [];
  if (status) { query += " AND status = ?"; params.push(status); }
  if (search) { query += " AND (name LIKE ? OR phone LIKE ? OR ref LIKE ?)"; const l = `%${search}%`; params.push(l, l, l); }
  query += " ORDER BY created_at DESC";
  res.json({ ok: true, orders: db.prepare(query).all(...params) });
});

router.get("/orders/:ref", requireAuth, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE ref = ?").get(req.params.ref);
  if (!order) return res.status(404).json({ ok: false, error: "Commande introuvable." });
  order.items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  res.json({ ok: true, order });
});

router.patch("/orders/:ref/status", requireAuth, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ ok: false, error: "Statut requis." });
  db.prepare("UPDATE orders SET status = ? WHERE ref = ?").run(status, req.params.ref);
  res.json({ ok: true });
});

router.get("/orders/:ref/invoice", requireAuth, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE ref = ?").get(req.params.ref);
  if (!order) return res.status(404).send("Commande introuvable.");
  order.items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  generateInvoicePDF(res, order, COMPANY);
});

router.get("/stats", requireAuth, (req, res) => {
  const nbCommandes = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  const ca = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status = 'Payé'").get().s;
  const caEnAttente = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'Payé'").get().s;
  const topProduits = db.prepare(`SELECT name, SUM(qty) AS qty_total, SUM(qty * price) AS ca_total FROM order_items GROUP BY name ORDER BY ca_total DESC LIMIT 10`).all();
  res.json({ ok: true, nbCommandes, ca, caEnAttente, topProduits });
});

module.exports = router;
