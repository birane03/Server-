// routes/paytech.js — Paiement en ligne via PayTech (Intech) : Orange Money, Wave, Free Money, carte...
// Doc officielle : https://docs.intech.sn/doc_paytech.php
//   1. POST /api/paytech/create  → enregistre la commande + crée le paiement PayTech, renvoie l'URL de paiement
//   2. POST /api/paytech/ipn     → PayTech notifie ici le résultat (notification signée, vérifiée ici)
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../db");

const PAYTECH_URL = "https://paytech.sn/api/payment/request-payment";

function genRef() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `CMD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function backendPublicUrl() {
  return (process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
}

// POST /api/paytech/create
router.post("/create", async (req, res) => {
  const { name, phone, address, city, email, notes, items } = req.body;
  if (!name || !phone || !address || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: "Coordonnées ou articles manquants." });
  }

  // Le total est recalculé côté serveur à partir des lignes (on ne fait pas confiance au champ "total" envoyé).
  const total = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const hasUnpriced = items.some((it) => !Number(it.price));
  if (!total || total < 100) {
    return res.status(400).json({ ok: false, error: "Le panier doit contenir au moins un article avec prix pour payer en ligne." });
  }

  const apiKey = process.env.PAYTECH_API_KEY;
  const apiSecret = process.env.PAYTECH_API_SECRET;
  if (!apiKey || !apiSecret) {
    return res.status(500).json({ ok: false, error: "PayTech n'est pas encore configuré sur le serveur." });
  }

  if (!process.env.PUBLIC_SITE_URL) {
    return res.status(500).json({ ok: false, error: "PUBLIC_SITE_URL n'est pas configurée sur le serveur (adresse du site public)." });
  }

  const ref = genRef();
  const insertOrder = db.prepare(`
    INSERT INTO orders (ref, created_at, name, phone, address, city, email, notes, total, has_unpriced, status, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertItem = db.prepare(`INSERT INTO order_items (order_id, name, brand, format, qty, price) VALUES (?, ?, ?, ?, ?, ?)`);

  let orderId;
  try {
    orderId = db.transaction(() => {
      const info = insertOrder.run(
        ref, new Date().toISOString(), name, phone, address,
        city || "", email || "", notes || "",
        total, hasUnpriced ? 1 : 0, "En attente de paiement", "PayTech"
      );
      items.forEach((it) => insertItem.run(info.lastInsertRowid, it.name, it.brand || "", it.format || "", it.qty || 1, it.price || 0));
      return info.lastInsertRowid;
    })();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Erreur d'enregistrement de la commande." });
  }

  const siteUrl = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const backendUrl = backendPublicUrl();
  const payload = {
    item_name: `Commande D.A.P ${ref}`,
    item_price: total,
    currency: "XOF",
    ref_command: ref,
    command_name: `Commande D.A.P ${ref}`,
    env: process.env.PAYTECH_ENV === "prod" ? "prod" : "test",
    success_url: `${siteUrl}/commande.html?paiement=succes&ref=${ref}`,
    cancel_url: `${siteUrl}/commande.html?paiement=annule&ref=${ref}`,
    custom_field: JSON.stringify({ ref }),
  };
  if (backendUrl.startsWith("https://")) payload.ipn_url = `${backendUrl}/api/paytech/ipn`;
  if (process.env.PAYTECH_TARGET_PAYMENT) payload.target_payment = process.env.PAYTECH_TARGET_PAYMENT;

  try {
    const ptRes = await fetch(PAYTECH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", API_KEY: apiKey, API_SECRET: apiSecret },
      body: JSON.stringify(payload),
    });
    const data = await ptRes.json().catch(() => ({}));
    if (!data || Number(data.success) !== 1 || !data.redirect_url) {
      console.error("Réponse PayTech inattendue :", data);
      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run("Échec paiement", orderId);
      return res.status(502).json({ ok: false, error: "PayTech a refusé la création du paiement.", ref });
    }
    db.prepare("UPDATE orders SET wave_session_id = ? WHERE id = ?").run(data.token || null, orderId);
    res.json({ ok: true, ref, redirect_url: data.redirect_url });
  } catch (err) {
    console.error(err);
    res.status(502).json({ ok: false, error: "Impossible de contacter PayTech.", ref });
  }
});

// POST /api/paytech/ipn — notification de PayTech (corps JSON ou formulaire)
router.post("/ipn", (req, res) => {
  const apiKey = process.env.PAYTECH_API_KEY;
  const apiSecret = process.env.PAYTECH_API_SECRET;
  if (!apiKey || !apiSecret) return res.status(500).send("PayTech non configuré.");

  const b = req.body || {};
  const amount = b.final_item_price || b.item_price;

  // Vérification d'authenticité : HMAC-SHA256 (méthode recommandée), sinon comparaison des hash SHA256 des clés.
  let authentic = false;
  if (b.hmac_compute) {
    const message = `${amount}|${b.ref_command}|${apiKey}`;
    const expected = crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
    authentic = safeEqual(expected, b.hmac_compute);
  } else if (b.api_key_sha256 && b.api_secret_sha256) {
    const k = crypto.createHash("sha256").update(apiKey).digest("hex");
    const s = crypto.createHash("sha256").update(apiSecret).digest("hex");
    authentic = safeEqual(k, b.api_key_sha256) && safeEqual(s, b.api_secret_sha256);
  }
  if (!authentic) {
    console.error("IPN PayTech rejetée : signature invalide.");
    return res.status(403).send("Signature invalide.");
  }

  const ref = b.ref_command;
  const order = db.prepare("SELECT * FROM orders WHERE ref = ?").get(ref);
  if (!order) return res.status(404).send("Commande inconnue.");

  if (b.type_event === "sale_complete") {
    // En production, le montant payé doit correspondre exactement à la commande.
    if (b.env === "prod" && Number(amount) !== Number(order.total)) {
      console.error(`IPN ${ref} : montant ${amount} différent du total ${order.total} — ignorée.`);
      return res.status(409).send("Montant incohérent.");
    }
    db.prepare("UPDATE orders SET status = ?, wave_transaction_id = ? WHERE ref = ?")
      .run("Payé", b.payment_method ? `PayTech · ${b.payment_method}` : "PayTech", ref);
  } else if (b.type_event === "sale_canceled" && order.status !== "Payé") {
    db.prepare("UPDATE orders SET status = ? WHERE ref = ?").run("Échec paiement", ref);
  }
  res.status(200).send("ok");
});

module.exports = router;
