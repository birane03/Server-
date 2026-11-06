// server.js — Point d'entrée du backend D.A.P
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Indispensable sur Render/Heroku/etc. : le vrai HTTPS est géré par un proxy devant le serveur.
// Sans cette ligne, Express ne sait pas que la connexion est sécurisée, et les cookies de
// session (login admin) ne se gardent pas d'une requête à l'autre.
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*", credentials: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "change-moi-en-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

// Le webhook Wave a besoin du corps BRUT pour vérifier sa signature
app.use((req, res, next) => {
  if (req.path === "/api/checkout/webhook") {
    express.raw({ type: "application/json" })(req, res, () => {
      req.rawBody = req.body ? req.body.toString("utf8") : "";
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// PayTech envoie ses notifications (IPN) en formulaire : on accepte aussi ce format.
app.use(express.urlencoded({ extended: true }));

app.use("/api/orders", require("./routes/orders"));
app.use("/api/paytech", require("./routes/paytech"));
app.use("/api/checkout", require("./routes/checkout"));
app.use("/api/admin", require("./routes/admin"));

app.use("/admin", express.static(path.join(__dirname, "public/admin")));
app.use("/images", express.static(path.join(__dirname, "public/images")));

app.get("/", (req, res) => res.send("D.A.P backend — OK"));
app.listen(PORT, () => console.log(`D.A.P backend démarré sur le port ${PORT}`));
