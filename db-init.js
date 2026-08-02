const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Your Render External Database URL
const connectionString = "postgresql://medgenesis_1ar5_user:8kzBdPTypO9W6NCd1vVsXJ82PlvVKnKJ@dpg-d9nj7lbm8hqs73efg15g-a.singapore-postgres.render.com/medgenesis_1ar5?ssl=true";

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to Render Postgres successfully!");
    
    const sqlPath = path.join(__dirname, 'backend', 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await client.query(sql);
    console.log("SUCCESS: All tables (users, access_permissions, reports) created!");
  } catch (err) {
    console.error("Error initializing database:", err);
  } finally {
    await client.end();
  }
}

run();