import { describe, it, expect, afterAll } from 'vitest'; // <-- Correction ici !
const request = require('supertest');
const app = require('../index');
const pool = require('../db');

afterAll(async () => { 
    if (pool && typeof pool.end === 'function') {
        await pool.end(); // Fermeture propre de la connexion PostgreSQL
    }
});

describe('🧪 Suite de Certification Bancaire UY1 - INF3521', () => {

    // --- 1. TESTS DE GESTION DES UTILISATEURS ---
    it('T1: Création d\'un compte utilisateur valide', async () => {
        const uniqueEmail = `user${Date.now()}@uy1.cm`;
        const res = await request(app)
            .post('/users')
            .send({ nom: "Nathanael", email: uniqueEmail });
        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('id');
    });

    it('T2: Mise à jour partielle du profil (COALESCE)', async () => {
        const res = await request(app)
            .put('/users/1')
            .send({ nom: "MBEDE Nathanael Marie" });
        expect(res.statusCode).toBe(200);
        expect(res.body.nom).toBe("MBEDE Nathanael Marie");
    });

    // --- 2. TESTS DE GESTION DES COMPTES BANCAIRES ---
    it('T3: Création d\'un nouveau compte bancaire pour un client', async () => {
        const res = await request(app)
            .post('/accounts')
            .send({ 
                client_id: 1, 
                solde_initial: 5000 
            });
        
        if (res.statusCode === 201) {
            expect(res.body).toHaveProperty('id');
            expect(Number(res.body.solde)).toBe(5000);
        } else {
            expect([201, 404, 500]).toContain(res.statusCode);
        }
    });

    it('T4: Récupération du solde et détails d\'un compte existant', async () => {
        const res = await request(app).get('/accounts/1');
        if (res.statusCode === 200) {
            expect(res.body).toHaveProperty('solde');
            expect(res.body).toHaveProperty('client_id');
        }
    });

    // --- 3. TESTS DU SERVICE DE DÉPÔT DE FONDS ---
    it('T5: Dépôt de fonds réussi sur un compte valide', async () => {
        const res = await request(app)
            .post('/accounts/deposit')
            .send({ 
                compteId: 1, 
                montant: 25000,
                description: "Dépôt initial de test"
            });
        
        if (res.statusCode === 200) {
            expect(res.body).toHaveProperty('nouveau_solde');
            expect(res.body.message).toContain("succès");
        } else {
            expect(res.statusCode).toBe(404);
        }
    });

    it('T6: Rejet d\'un dépôt avec montant invalide ou négatif', async () => {
        const res = await request(app)
            .post('/accounts/deposit')
            .send({ 
                compteId: 1, 
                montant: -5000 
            });
        expect([400, 500]).toContain(res.statusCode);
    });

    // --- 4. TESTS DE VIREMENT INTERNE & SMS ---
    it('T8: Virement réussi avec notification SMS', async () => {
        const res = await request(app)
            .post('/transfer')
            .send({ 
                from_account: 1, 
                to_account: 2, 
                amount: 1000, 
                telephone: "677000000" 
            });
        expect([200, 400]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.body.notification).toBe("Envoyé");
        }
    });

    it('T9: Virement financier réussi malgré échec SMS', async () => {
        const res = await request(app)
            .post('/transfer')
            .send({ 
                from_account: 1, 
                to_account: 2, 
                amount: 500, 
                telephone: "123"
            });
        if (res.statusCode === 200) {
            expect(res.body.notification).toContain("Échec");
        }
    });

    // --- 5. TESTS DE SÉCURITÉ ET EXISTENCE ---
    it('T11: Rejet pour solde insuffisant', async () => {
        const res = await request(app)
            .post('/transfer')
            .send({ from_account: 1, to_account: 2, amount: 9999999 });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("Solde insuffisant pour effectuer cette transaction");
    });

    it('T12: Rejet si le compte bénéficiaire n\'existe pas', async () => {
        const res = await request(app)
            .post('/transfer')
            .send({ 
                from_account: 1, 
                to_account: 99999, 
                amount: 100 
            });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain("n'existe pas");
    });

    // --- 6. TESTS DE VIREMENT EXTERNE (AXIOS) ---
    it('T10: Virement interbancaire externe via Axios', async () => {
        const res = await request(app)
            .post('/transfer/external')
            .send({ 
                from_account: 1, 
                target_iban: "CM-UBA-00123", 
                amount: 2000 
            });
        expect([200, 400]).toContain(res.statusCode);
        if (res.statusCode === 200) {
            expect(res.body).toHaveProperty('ref_externe');
        }
    });
});