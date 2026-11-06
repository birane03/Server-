// invoice.js — Génération de la facture PDF à partir d'une commande
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const NAVY = "#00304F";
const INK = "#4C6478";
const LOGO_PATH = path.join(__dirname, "public", "images", "dap-logo.png");

// Séparateur de milliers avec une espace normale.
// (toLocaleString("fr-FR") utilise une espace insécable fine que la police du PDF
// ne sait pas afficher : elle apparaissait comme un "/" — ex. "18/ 000".)
function formatNumber(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatFCFA(n) {
  return formatNumber(n) + " FCFA";
}

function formatDate(iso) {
  const d = new Date(iso);
  const pad = (x) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function generateInvoicePDF(res, order, company) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="facture-${order.ref}.pdf"`);
  doc.pipe(res);

  // En-tête : logo à gauche, coordonnées de la société à droite
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 50, 38, { width: 110 });
  }
  doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold")
    .text(company.name, 250, 44, { width: 295, align: "right" });
  doc.fillColor(INK).fontSize(9).font("Helvetica")
    .text(company.address, 250, 60, { width: 295, align: "right" })
    .text(`Tél : ${company.phone}  ·  ${company.email}`, 250, 73, { width: 295, align: "right" })
    .text(company.ninea, 250, 86, { width: 295, align: "right" });

  doc.moveTo(50, 118).lineTo(545, 118).strokeColor(NAVY).lineWidth(1.5).stroke();

  doc.fillColor(NAVY).fontSize(22).font("Helvetica-Bold").text("FACTURE", 50, 135);

  doc.fontSize(9).font("Helvetica").fillColor(INK)
    .text("N° facture", 400, 138).font("Helvetica-Bold").fillColor(NAVY).text(order.ref, 400, 150)
    .font("Helvetica").fillColor(INK).text("Date", 400, 168)
    .font("Helvetica-Bold").fillColor(NAVY).text(formatDate(order.created_at), 400, 180);

  let y = 210;
  doc.roundedRect(50, y, 495, 70, 6).fillAndStroke("#F6F9FB", "#DCE6ED");
  doc.fillColor(INK).fontSize(8).font("Helvetica").text("CLIENT", 62, y + 10);
  doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold").text(order.name, 62, y + 22);
  doc.fillColor(INK).fontSize(9).font("Helvetica")
    .text(order.phone, 62, y + 40)
    .text(`${order.address}${order.city ? ", " + order.city : ""}`, 62, y + 53);

  y += 95;
  const colX = { name: 55, format: 230, qty: 330, price: 370, total: 455 };
  doc.rect(50, y, 495, 22).fill(NAVY);
  doc.fillColor("#fff").fontSize(8).font("Helvetica-Bold");
  doc.text("PRODUIT", colX.name, y + 7);
  doc.text("FORMAT", colX.format, y + 7);
  doc.text("QTÉ", colX.qty, y + 7);
  doc.text("PRIX UNIT.", colX.price, y + 7);
  doc.text("TOTAL", colX.total, y + 7);
  y += 22;

  doc.font("Helvetica").fontSize(9);
  order.items.forEach((item, i) => {
    // La ligne grandit si le nom du produit passe sur plusieurs lignes
    const nameH = doc.heightOfString(item.name, { width: 165 });
    const rowH = Math.max(22, nameH + 12);
    // Nouvelle page s'il n'y a plus assez de place (commandes avec beaucoup d'articles)
    if (y + rowH > 700) { doc.addPage(); y = 50; }
    if (i % 2 === 1) doc.rect(50, y, 495, rowH).fill("#F6F9FB");
    doc.fillColor(NAVY);
    doc.text(item.name, colX.name, y + 6, { width: 165 });
    doc.text(item.format || "-", colX.format, y + 6, { width: 95, lineBreak: false });
    doc.text(String(item.qty), colX.qty, y + 6);
    doc.text(item.price ? formatFCFA(item.price) : "sur demande", colX.price, y + 6, { width: 82, lineBreak: false });
    doc.text(item.price ? formatFCFA(item.price * item.qty) : "-", colX.total, y + 6, { width: 90, lineBreak: false });
    y += rowH;
  });

  if (y + 60 > 740) { doc.addPage(); y = 50; }
  doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor(NAVY).lineWidth(1.5).stroke();
  y += 16;
  doc.fontSize(10).fillColor(INK).font("Helvetica").text("Total à payer", 380, y);
  doc.fontSize(16).font("Helvetica-Bold").fillColor(NAVY).text(formatFCFA(order.total), 380, y + 14);

  doc.fontSize(9).font("Helvetica-Oblique").fillColor(INK)
    .text("Merci de votre confiance — D.A.P, la qualité, notre promesse.", 50, 780, { width: 495, align: "center", lineBreak: false });

  doc.end();
}

module.exports = { generateInvoicePDF, formatFCFA };
