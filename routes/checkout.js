// routes/checkout.js — Intégration API Wave Business (paiement automatique + webhook de confirmation)
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../db");

const WAVE_API_BASE = "https://api.wave.com";

function genRef() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `CMD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// POST /api/checkout/create — enregistre la commande + crée la session Wave, renvoie l'URL de paiement
router.post("/create", async (req, res) => {
  const { name, phone, address, city, email, notes, items, total, hasUnpriced } = req.body;
  if (!name || !phone || !address || !Array.isArray(items) || items.length === 0 || !total) {
    return res.status(400).json({ ok: false, error: "Commande invalide (articles avec prix requis pour payer via Wave)." });
  }

  const ref = genRef();
  const insertOrder = db.prepare(`
    INSERT INTO orders (ref, created_at, name, phone, address, city, email, notes, total, has_unpriced, status, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertItem = db.prepare(`INSERT INTO order_items (order_id, name, brand, format, qty, price) VALUES (?, ?, ?, ?, ?, ?)`);

  let orderId;
  try {
    const tx = db.transaction(() => {
      const info = insertOrder.run(
        ref, new Date().toISOString(), name, phone, address,
        city || "", email || "", notes || "",
        total, hasUnpriced ? 1 : 0,
        "En attente de paiement", "Wave"
      );
      items.forEach((it) => insertItem.run(info.lastInsertRowid, it.name, it.brand || "", it.format || "", it.qty || 1, it.price || 0));
      return info.lastInsertRowid;
    });
    orderId = tx();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Erreur d'enregistrement." });
  }

  const apiKey = process.env.WAVE_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: "WAVE_API_KEY non configurée.", ref });

  const siteUrl = process.env.PUBLIC_SITE_URL || "https://votre-site.exemple.com";
  const payload = {
    amount: String(total),
    currency: "XOF",
    client_reference: ref,
    success_url: `${siteUrl}/commande.html?paiement=succes&ref=${ref}`,
    error_url: `${siteUrl}/commande.html?paiement=echec&ref=${ref}`,
  };

  try {
    const waveRes = await fetch(`${WAVE_API_BASE}/v1/checkout/sessions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const waveData = await waveRes.json();
    if (!waveRes.ok) {
      console.error("Erreur Wave:", waveData);
      return res.status(502).json({ ok: false, error: "Wave a refusé la création de session.", ref });
    }
    db.prepare("UPDATE orders SET wave_session_id = ? WHERE id = ?").run(waveData.id, orderId);
    res.json({ ok: true, ref, launch_url: waveData.wave_launch_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Impossible de contacter Wave.", ref });
  }
});

// POST /api/checkout/webhook — Wave confirme le paiement ici (corps brut requis, voir server.js)
router.post("/webhook", (req, res) => {
  const signatureHeader = req.headers["wave-signature"];
  const webhookSecret = process.env.WAVE_WEBHOOK_SECRET;
  const rawBody = req.rawBody;

  if (!webhookSecret) return res.status(500).send("Webhook secret non configuré.");
  if (!signatureHeader) return res.status(400).send("Signature manquante.");

  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", webhookSecret).update(parts.t + rawBody).digest("hex");
  if (expected !== parts.v1) return res.status(401).send("Signature invalide.");

  let event;
  try { event = JSON.parse(rawBody); } catch { return res.status(400).send("JSON invalide."); }

  if (event.type === "checkout.session.completed") {
    const data = event.data || {};
    const ref = data.client_reference;
    const paid = data.payment_status === "succeeded" || data.checkout_status === "complete";
    if (ref) {
      db.prepare("UPDATE orders SET status = ?, wave_transaction_id = ? WHERE ref = ?")
        .run(paid ? "Payé" : "Échec paiement", data.transaction_id || null, ref);
    }
  }
  res.status(200).send("ok");
});

module.exports = router;
