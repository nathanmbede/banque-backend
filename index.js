require('dotenv').config();
const express = require('express');
const pool = require('./db');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors'); // Enregistrement du module CORS

// Chargement direct de ton fichier de spécification JSON complet
const swaggerDocument = require('./swagger.json'); 

const app = express();

// =========================================================================
// MIDDLEWARES INDISPENSABLES
// =========================================================================
app.use(cors()); // Autorise Swagger UI à exécuter les requêtes sans blocage
app.use(express.json());

// =========================================================================
// 1. CONFIGURATION DE LA DOCUMENTATION SWAGGER
// =========================================================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Redirection automatique de la racine vers l'interface Swagger
app.get('/', (req, res) => res.redirect('/api-docs'));


// =========================================================================
// 2. SIMULATION SERVICE SMS
// =========================================================================
const sendSMS = async (telephone, message) => {
    console.log(`[SMS Gateway] Envoi vers ${telephone} : ${message}`);
    if (!telephone || telephone.length < 8) {
        throw new Error("Format de numéro de téléphone invalide");
    }
    return { status: 'sent', provider_ref: Date.now() };
};


// =========================================================================
// 3. GESTION DES UTILISATEURS (CRUD - API)
// =========================================================================

// Créer un utilisateur
app.post('/users', async (req, res) => {
    try {
        const { nom, email } = req.body;
        const result = await pool.query(
            'INSERT INTO clients (nom, email) VALUES ($1, $2) RETURNING *', 
            [nom, email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la création de l'utilisateur" });
    }
});

// Modifier un utilisateur
app.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, email } = req.body;
        const result = await pool.query(
            'UPDATE clients SET nom = COALESCE($1, nom), email = COALESCE($2, email) WHERE id = $3 RETURNING *',
            [nom, email, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: "Utilisateur non trouvé" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// 4. OPÉRATIONS FINANCIÈRES (API)
// =========================================================================

// Virement interne
app.post('/transfer', async (req, res) => {
    const { from_account, to_account, amount, telephone } = req.body;

    if (amount > 500000) {
        return res.status(400).json({ error: "Limite de virement de 500 000 FCFA dépassée" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const checkExist = await client.query(
            'SELECT id FROM comptes WHERE id IN ($1, $2)', 
            [from_account, to_account]
        );

        if (checkExist.rowCount < 2) {
            throw new Error("L'un des comptes (émetteur ou bénéficiaire) n'existe pas");
        }

        const checkSolde = await client.query(
            'SELECT solde FROM comptes WHERE id = $1 FOR UPDATE', 
            [from_account]
        );

        if (checkSolde.rows[0].solde < amount) {
            throw new Error("Solde insuffisant pour effectuer cette transaction");
        }

        await client.query('UPDATE comptes SET solde = solde - $1 WHERE id = $2', [amount, from_account]);
        await client.query('UPDATE comptes SET solde = solde + $1 WHERE id = $2', [amount, to_account]);

        let smsStatus = "Non demandé";
        if (telephone) {
            try {
                await sendSMS(telephone, `UY1-BANK: Transfert de ${amount} FCFA vers le compte ${to_account} réussi.`);
                smsStatus = "Envoyé";
            } catch (smsErr) {
                smsStatus = "Échec (Service indisponible)";
            }
        }

        await client.query('COMMIT');
        res.json({ 
            status: "Success",
            message: "Transfert interne réalisé avec succès", 
            notification: smsStatus 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Virement externe
app.post('/transfer/external', async (req, res) => {
    const { from_account, target_iban, amount } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const check = await client.query('SELECT solde FROM comptes WHERE id = $1 FOR UPDATE', [from_account]);
        if (check.rows[0].solde < amount) throw new Error("Solde local insuffisant");

        await client.query('UPDATE comptes SET solde = solde - $1 WHERE id = $2', [amount, from_account]);

        const externalRes = await axios.post('https://jsonplaceholder.typicode.com/posts', {
            target: target_iban,
            value: amount,
            bank_code: "UBA-CM"
        });

        if (externalRes.status === 201 || externalRes.status === 200) {
            await client.query('COMMIT');
            res.json({ message: "Virement externe réussi", ref_externe: externalRes.data.id });
        } else {
            throw new Error("La banque réceptrice a rejeté la transaction");
        }

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// =========================================================================
// GESTION DES COMPTES BANCAIRES (CRUD - API)
// =========================================================================

// 1. Créer un nouveau compte bancaire (POST /accounts)
app.post('/accounts', async (req, res) => {
    try {
        const { client_id, solde_initial } = req.body;

        // Vérifier d'abord si le client existe
        const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [client_id]);
        if (clientCheck.rowCount === 0) {
            return res.status(404).json({ error: "Client non trouvé. Impossible de créer un compte." });
        }

        // Insertion du compte
        const result = await pool.query(
            'INSERT INTO comptes (client_id, solde) VALUES ($1, $2) RETURNING *',
            [client_id, solde_initial || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la création du compte bancaire" });
    }
});

// 2. Obtenir les détails et le solde d'un compte (GET /accounts/:id)
app.get('/accounts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM comptes WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Compte introuvable" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// SERVICE DE DÉPÔT DE FONDS
// =========================================================================

// 3. Effectuer un dépôt sur un compte (POST /accounts/deposit)
app.post('/accounts/deposit', async (req, res) => {
    const { compteId, montant } = req.body;

    if (!montant || montant <= 0) {
        return res.status(400).json({ error: "Le montant du dépôt doit être supérieur à 0" });
    }

    try {
        // Mettre à jour le solde du compte s'il existe
        const result = await pool.query(
            'UPDATE comptes SET solde = solde + $1 WHERE id = $2 RETURNING *',
            [montant, compteId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Compte introuvable pour effectuer le dépôt" });
        }

        res.json({
            message: "Dépôt réalisé avec succès",
            compte_id: result.rows[0].id,
            nouveau_solde: result.rows[0].solde
        });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur lors du traitement du dépôt" });
    }
});


// =========================================================================
// 5. DÉMARRAGE DU SERVEUR
// =========================================================================
const PORT = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ Serveur Bancaire UY1 opérationnel sur le port ${PORT}`);
    });
}

module.exports = app;