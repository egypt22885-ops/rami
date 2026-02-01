const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ====== 💰 إعدادات المتجر ======
const WALLET = "TY1GSbMY6nHVfjxzqQnQTsbxVQbcFqcjRV";
const AMOUNT = 15;
const TRON_API_KEY = "c1e2440b-1ecf-4e2d-aca6-820997a56566";
// =============================

// تحديد المسارات بدقة
const DB_PATH = path.join(__dirname, "db.json");
const PDF_FOLDER = path.join(__dirname, "pdf");

// ✅ التعديل هنا: حذفنا النقطتين (../) ليقرأ المجلد الموجود بجانبه مباشرة
const FRONTEND_FOLDER = path.join(__dirname, "frontend");

app.use(express.static(FRONTEND_FOLDER));

// --- 💾 دوال قاعدة البيانات ---
function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        const initialDB = { 
            stats: { visitors: 0, downloads: 0, earnings: 0 }, 
            tokens: {}, 
            used_tx: [],
            sales_history: [] 
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
        return initialDB;
    }
    const db = JSON.parse(fs.readFileSync(DB_PATH));
    if (!db.sales_history) db.sales_history = [];
    return db;
}

function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// --- 🏠 الصفحة الرئيسية (تضمن فتح الموقع) ---
app.get("/", (req, res) => {
    res.sendFile(path.join("index.html"));
});

// --- 📊 تسجيل الزيارات ---
app.get("/track-visit", (req, res) => {
    const db = loadDB();
    db.stats.visitors = (db.stats.visitors || 0) + 1;
    saveDB(db);
    res.json({ success: true });
});

// --- 💰 التحقق من الدفع ---
app.post("/api/check-payment", async (req, res) => {
    try {
        const db = loadDB();
        console.log(`...جاري البحث عن دفعة حديثة...`);

        const url = `https://api.trongrid.io/v1/accounts/${WALLET}/transactions/trc20?limit=20`;
        const r = await axios.get(url, {
            headers: { "TRON-PRO-API-KEY": TRON_API_KEY },
            timeout: 10000,
        });

        const currentTime = Date.now();
        const TIME_LIMIT = 20 * 60 * 1000; 

        const tx = r.data.data.find((t) => {
            const isUSDT = t.token_info && t.token_info.symbol === "USDT";
            const isCorrectAmount = Number(t.value) / 1e6 >= AMOUNT;
            const isNotUsed = !db.used_tx.includes(t.transaction_id);
            const txTime = t.block_timestamp;
            const isRecent = (currentTime - txTime) < TIME_LIMIT;
            return isUSDT && isCorrectAmount && isNotUsed && isRecent;
        });

        if (!tx) {
            return res.json({ success: false, message: "لم يتم العثور على دفعة حديثة." });
        }

        if (!db.used_tx) db.used_tx = [];
        db.used_tx.push(tx.transaction_id);

        const saleRecord = {
            date: new Date().toLocaleString("en-US"),
            tx_id: tx.transaction_id,
            amount: AMOUNT,
            from: tx.from || "Unknown"
        };
        db.sales_history.unshift(saleRecord);

        const token = crypto.randomBytes(24).toString("hex");
        db.tokens[token] = { used: false, expires: Date.now() + 24 * 60 * 60 * 1000 };

        db.stats.downloads += 1;
        db.stats.earnings += AMOUNT;
        saveDB(db);

        console.log(`✅ بيعة جديدة!`);
        res.json({ success: true, downloadUrl: `/download/${token}` });

    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).json({ success: false, message: "Network Error" });
    }
});

// --- 📥 التحميل ---
app.get("/download-book", (req, res) => {
    res.send("<h1>يجب إتمام الدفع أولاً للحصول على رابط التحميل</h1>");
});

app.get("/download/:token", (req, res) => {
    const db = loadDB();
    const t = db.tokens[req.params.token];
    if (!t) return res.status(403).send("<h1>❌ الرابط منتهي أو غير صالح</h1>");

    const filePath = path.join(PDF_FOLDER, "shield.pdf");
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send("File not found (shield.pdf)");
    }
});

// --- 🕵️‍♂️ لوحة التحكم ---
app.get("/admin/dashboard", (req, res) => {
    const db = loadDB();
    let historyRows = db.sales_history.map(sale => `
        <tr>
            <td>${sale.date}</td>
            <td style="font-family:monospace; color:#ccc;">${sale.tx_id.substring(0, 15)}...</td>
            <td style="color:#4caf50;">$${sale.amount}</td>
        </tr>
    `).join("");

    if (historyRows === "") historyRows = "<tr><td colspan='3'>لا توجد مبيعات حتى الآن</td></tr>";

    const html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <title>لوحة القيادة</title>
        <style>
            body { background: #111; color: #d4af37; font-family: sans-serif; padding: 40px; }
            table { width: 100%; border-collapse: collapse; background: #222; margin-top: 20px; }
            th, td { padding: 10px; border: 1px solid #444; text-align: center; }
        </style>
    </head>
    <body> 
        <h1>لوحة تحكم سيكلوجية البقاء </h1>
        <h3>الأرباح الكلية: $${db.stats.earnings}</h3>
        <table>
            <tr><th>التاريخ</th><th>العملية</th><th>المبلغ</th></tr>
            ${historyRows}
        </table>
    </body>
    </html>
    `;
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

