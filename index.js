require('dotenv').config(); // 1. Charger les variables d'environnement
const express = require('express'); // 2. Importer Express
const pool = require('./db'); // 3. Importer la connexion DB (votre fichier db.js)

const app = express(); // 4. CRÉER l'objet 'app' (C'est ce qui manquait !)

app.use(express.json()); // 5. Permettre à l'app de lire le JSON

// --- VOS ROUTES ---

// Route pour créer un utilisateur (celle qui posait problème)
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

// --- DÉMARRAGE DU SERVEUR ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log("-----------------------------------------");
    console.log(`SERVEUR BANCAIRE LANCÉ SUR LE PORT ${PORT}`);
    console.log(`Lien : http://localhost:${PORT}/api-docs`);
    console.log("-----------------------------------------");
});
/**
 * @swagger
 * /transfer:
 * post:
 * summary: Effectuer un virement entre deux comptes
 * tags: [Transactions]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * from_account: { type: integer }
 * to_account: { type: integer }
 * amount: { type: number }
 */
app.post('/transfer', async (req, res) => {
    const client = await pool.connect(); // On utilise un client spécifique pour la transaction
    try {
        const { from_account, to_account, amount } = req.body;
        
        await client.query('BEGIN'); // Début de la transaction

        // 1. Débiter le compte émetteur
        const debitRes = await client.query(
            'UPDATE comptes SET solde = solde - $1 WHERE id = $2 AND solde >= $1 RETURNING solde',
            [amount, from_account]
        );

        if (debitRes.rowCount === 0) throw new Error('Solde insuffisant ou compte inexistant');

        // 2. Créditer le compte récepteur
        await client.query('UPDATE comptes SET solde = solde + $1 WHERE id = $2', [amount, to_account]);

        // 3. Enregistrer la trace dans la table transactions
        await client.query(
            'INSERT INTO transactions (compte_id, montant, type_transaction) VALUES ($1, $2, $3)',
            [from_account, -amount, 'virement_sortant']
        );

        await client.query('COMMIT'); // On valide tout
        res.json({ message: "Virement effectué avec succès" });
    } catch (err) {
        await client.query('ROLLBACK'); // En cas d'erreur, on annule tout
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});
/**
 * @swagger
 * /transactions/{compte_id}:
 * get:
 * summary: Liste des transactions d'un compte
 * tags: [Transactions]
 * parameters:
 * - in: path
 * name: compte_id
 * required: true
 * schema:
 * type: integer
 */
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
// AJOUTE CECI APRÈS TES ROUTES /users
app.post('/transfer', async (req, res) => {
    const client = await pool.connect();
    try {
        const { from_account, to_account, amount } = req.body;
        await client.query('BEGIN'); // Début de la transaction sécurisée

        // Retrait d'argent
        const debit = await client.query(
            'UPDATE comptes SET solde = solde - $1 WHERE id = $2 AND solde >= $1 RETURNING solde',
            [amount, from_account]
        );

        if (debit.rowCount === 0) throw new Error('Fonds insuffisants');

        // Ajout d'argent
        await client.query('UPDATE comptes SET solde = solde + $1 WHERE id = $2', [amount, to_account]);

        // Historisation
        await client.query(
            'INSERT INTO transactions (compte_id, montant, type_transaction) VALUES ($1, $2, $3)',
            [from_account, -amount, 'virement_sortant']
        );

        await client.query('COMMIT'); // Validation finale
        res.json({ message: "Virement réussi !" });
    } catch (err) {
        await client.query('ROLLBACK'); // Annulation si erreur
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});
app.post('/transfer', async (req, res) => {
    const { from_account, to_account, amount } = req.body;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN'); // Début de la transaction sécurisée

        // 1. Vérifier le solde et débiter
        const resDebit = await client.query(
            'UPDATE comptes SET solde = solde - $1 WHERE id = $2 AND solde >= $1 RETURNING solde',
            [amount, from_account]
        );

        if (resDebit.rowCount === 0) {
            throw new Error('Fonds insuffisants ou compte inexistant');
        }

        // 2. Créditer le compte destinataire
        await client.query('UPDATE comptes SET solde = solde + $1 WHERE id = $2', [amount, to_account]);

        // 3. Enregistrer l'historique
        await client.query(
            'INSERT INTO transactions (compte_id, montant, type_transaction) VALUES ($1, $2, $3)',
            [from_account, -amount, 'virement_sortant']
        );

        await client.query('COMMIT'); // On valide tout
        res.json({ message: "Transfert réussi !" });
    } catch (err) {
        await client.query('ROLLBACK'); // En cas de souci, on annule tout
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});