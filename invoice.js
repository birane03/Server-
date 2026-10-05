// invoice.js — Génération de la facture PDF à partir d'une commande
const PDFDocument = require("pdfkit");

const NAVY = "#00304F";
const INK = "#4C6478";

function formatFCFA(n) {
  return Math.round(n).toLocaleString("fr-FR") + " FCFA";
}

function generateInvoicePDF(res, order, company) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="facture-${order.ref}.pdf"`);
  doc.pipe(res);

  doc.fillColor(NAVY).fontSize(16).font("Helvetica-Bold").text(company.name, 50, 50);
  doc.fillColor(INK).fontSize(9).font("Helvetica")
    .text(company.address, 50, 70)
    .text(`Tél : ${company.phone}  ·  ${company.email}`, 50, 84)
    .text(company.ninea, 50, 98);

  doc.moveTo(50, 120).lineTo(545, 120).strokeColor(NAVY).lineWidth(1.5).stroke();
  doc.fillColor(NAVY).fontSize(22).font("Helvetica-Bold").text("FACTURE", 50, 135);

  doc.fontSize(9).font("Helvetica").fillColor(INK)
    .text("N° facture", 400, 138).font("Helvetica-Bold").fillColor(NAVY).text(order.ref, 400, 150)
    .font("Helvetica").fillColor(INK).text("Date", 400, 168)
    .font("Helvetica-Bold").fillColor(NAVY).text(new Date(order.created_at).toLocaleDateString("fr-FR"), 400, 180);

  let y = 210;
  doc.roundedRect(50, y, 495, 70, 6).fillAndStroke("#F6F9FB", "#DCE6ED");
  doc.fillColor(INK).fontSize(8).font("Helvetica").text("CLIENT", 62, y + 10);
  doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold").text(order.name, 62, y + 22);
  doc.fillColor(INK).fontSize(9).font("Helvetica")
    .text(order.phone, 62, y + 40)
    .text(`${order.address}${order.city ? ", " + order.city : ""}`, 62, y + 53);

  y += 95;
  const colX = { name: 55, format: 230, qty: 340, price: 390, total: 470 };
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
    const rowH = 22;
    if (i % 2 === 1) doc.rect(50, y, 495, rowH).fill("#F6F9FB");
    doc.fillColor(NAVY);
    doc.text(item.name, colX.name, y + 6, { width: 165 });
    doc.text(item.format || "-", colX.format, y + 6, { width: 100 });
    doc.text(String(item.qty), colX.qty, y + 6);
    doc.text(item.price ? formatFCFA(item.price) : "sur demande", colX.price, y + 6, { width: 75 });
    doc.text(item.price ? formatFCFA(item.price * item.qty) : "-", colX.total, y + 6, { width: 75 });
    y += rowH;
  });

  doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor(NAVY).lineWidth(1.5).stroke();
  y += 16;
  doc.fontSize(10).fillColor(INK).text("Total à payer", 380, y);
  doc.fontSize(16).font("Helvetica-Bold").fillColor(NAVY).text(formatFCFA(order.total), 380, y + 14);

  doc.fontSize(9).font("Helvetica-Oblique").fillColor(INK)
    .text("Merci de votre confiance — D.A.P, la qualité, notre promesse.", 50, 760, { width: 495, align: "center" });

  doc.end();
}

module.exports = { generateInvoicePDF, formatFCFA };
