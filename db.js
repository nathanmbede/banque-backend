const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT,
});

// Petit test pour confirmer la connexion au démarrage
pool.on('connect', () => {
  console.log('Connecté avec succès à la base de données PostgreSQL');
});

module.exports = pool;