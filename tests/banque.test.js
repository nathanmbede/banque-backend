const request = require('supertest');
const app = require('../index');
const pool = require('../db'); // On importe la connexion pour pouvoir la fermer

describe('Tests INF3521 - Système Bancaire', () => {
  
  // Test de mise à jour (CRUD)
  it('Devrait mettre à jour un utilisateur', async () => {
    const res = await request(app)
      .put('/users/1') 
      .send({ nom: "Nathanael Marie Vincent" });
    expect(res.statusCode).not.toBe(404);
  });

  // Test de virement (Transaction)
  it('Devrait effectuer un virement', async () => {
    const res = await request(app)
      .post('/transfer')
      .send({ 
        from_account: 1, 
        to_account: 2, 
        amount: 1000 
      });
    expect(res.statusCode).not.toBe(404);
  });

  // Test de lecture (Historique)
  it('Devrait consulter l\'historique', async () => {
    const res = await request(app).get('/transactions/1');
    expect(res.statusCode).not.toBe(404);
  });
});

// C'EST CECI LE "afterAll" : il ferme la connexion à la fin
afterAll(async () => {
  await pool.end(); 
});