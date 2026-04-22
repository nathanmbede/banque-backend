require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

// --- ROUTES : UTILISATEURS (CRUD) ---

// Créer un utilisateur
app.post('/users', async (req, res) => {
    try {
        const { name, email } = req.body;
        const result = await pool.query(
            'INSERT INTO clients (nom, email) VALUES ($1, $2) RETURNING *',
            [name, email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Erreur lors de la création");
    }
});

// Mettre à jour un utilisateur (Requis pour le Devoir)
app.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nom } = req.body;
        const result = await pool.query(
            'UPDATE clients SET nom = $1 WHERE id = $2 RETURNING *',
            [nom, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES : TRANSACTIONS ---

/**
 * @swagger
 * /transfer:
 * post:
 * summary: Effectuer un virement (Retrait + Dépôt)
 */
app.post('/transfer', async (req, res) => {
    const client = await pool.connect();
    try {
        const { from_account, to_account, amount } = req.body;
        await client.query('BEGIN');

        // 1. Débit (Retrait)
        const debitRes = await client.query(
            'UPDATE comptes SET solde = solde - $1 WHERE id = $2 AND solde >= $1 RETURNING solde',
            [amount, from_account]
        );

        if (debitRes.rowCount === 0) throw new Error('Fonds insuffisants');

        // 2. Crédit (Dépôt)
        await client.query('UPDATE comptes SET solde = solde + $1 WHERE id = $2', [amount, to_account]);

        // 3. Historique
        await client.query(
            'INSERT INTO transactions (compte_id, montant, type_transaction) VALUES ($1, $2, $3)',
            [from_account, -amount, 'virement_sortant']
        );

        await client.query('COMMIT');
        res.json({ message: "Transfert réussi !" });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Consulter les transactions
app.get('/transactions/:compte_id', async (req, res) => {
    try {
        const { compte_id } = req.params;
        const result = await pool.query(
            'SELECT * FROM transactions WHERE compte_id = $1 ORDER BY date_transaction DESC',
            [compte_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DÉMARRAGE ET EXPORT ---

const PORT = process.env.PORT || 3000;

// On ne lance app.listen que si on n'est PAS en mode test
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log("-----------------------------------------");
        console.log(`SERVEUR BANCAIRE LANCÉ SUR LE PORT ${PORT}`);
        console.log("-----------------------------------------");
    });
}

// CRUCIAL POUR JEST/SUPERTEST
module.exports = app;