const sql = require("mssql");

const config = {
    user: "skadmin",
    password: "skadmin123",
    server: "DESKTOP-RPKBMV9\\SQLEXPRESS",
    database: "SKMaduyAssist",
    options: { encrypt: false, enableArithAbort: true }
};

async function testConnection() {
    try {
        await sql.connect(config);
        console.log("✅ Connected to SQL Server successfully!");
    } catch (err) {
        console.error("❌ Connection Failed:", err);
    }
}

testConnection();
