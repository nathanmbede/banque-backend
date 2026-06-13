# 📊 Graphes de Flot de Contrôle (Control Flow Graphs) - INF3521

Ce document regroupe la modélisation structurelle de la logique métier de l'API bancaire. Chaque graphe met en évidence les nœuds de décision (points de branchement conditionnels) et les blocs d'instructions linéaires.

---

## 1. CFG du Point d'accès : Virement Interne (`POST /transfer`)
Ce graphe représente l'endpoint le plus complexe du système, illustrant la validation du plafond, les verrous de concurrence et la tolérance aux pannes du service SMS.

```mermaid
graph TD
    %% Définition du style des nœuds
    classDef decision fill:#f9f,stroke:#333,stroke-width:2px;
    classDef process fill:#bbf,stroke:#333,stroke-width:1px;
    classDef terminal fill:#f96,stroke:#333,stroke-width:2px;

    Node_Start([Début: Reçu req.body]) --> Node_CheckCeiling{Montant > 500 000 FCFA ?}:::decision
    
    %% Branchement Plafond
    Node_CheckCeiling -- Oui --> Node_ErrCeiling[Retourner Erreur 400: Limite dépassée]:::terminal
    
    %% Branchement Transaction
    Node_CheckCeiling -- Non --> Node_DBConnect[client = pool.connect]:::process
    Node_DBConnect --> Node_SQLBegin[Exécuter client.query 'BEGIN']:::process
    Node_SQLBegin --> Node_CheckExist[Vérifier existence des 2 comptes]:::process
    
    Node_CheckExist --> Node_BranchExist{rowCount < 2 ?}:::decision
    Node_BranchExist -- Oui --> Node_Rollback1[Exécuter ROLLBACK]:::process
    Node_Rollback1 --> Node_ErrExist[Retourner Erreur 400: Compte introuvable]:::terminal
    
    Node_BranchExist -- Non --> Node_CheckSolde[Vérifier Solde avec FOR UPDATE]:::process
    Node_CheckSolde --> Node_BranchSolde{Solde < Montant ?}:::decision
    
    %% Branchement Solde
    Node_BranchSolde -- Oui --> Node_Rollback2[Exécuter ROLLBACK]:::process
    Node_Rollback2 --> Node_ErrSolde[Retourner Erreur 400: Solde insuffisant]:::terminal
    
    %% Débit / Crédit
    Node_BranchSolde -- Non --> Node_UpdateDebit[Débit compte émetteur]:::process
    Node_UpdateDebit --> Node_UpdateCredit[Crédit compte bénéficiaire]:::process
    Node_UpdateCredit --> Node_CheckSMS{Téléphone fourni ?}:::decision
    
    %% Bloc Notification Interne (Fault Tolerance)
    Node_CheckSMS -- Oui --> Node_TrySMS[Bloc TRY: Appeler sendSMS]:::process
    Node_TrySMS --> Node_SMSOk[smsStatus = 'Envoyé']:::process
    
    Node_TrySMS -.->|CATCH Error| Node_SMSFail[smsStatus = 'Échec Passerelle']:::process
    
    Node_CheckSMS -- Non --> Node_SMSNo[smsStatus = 'Non demandé']:::process
    
    %% Finalisation de la transaction
    Node_SMSOk --> Node_SQLCommit[Exécuter client.query 'COMMIT']:::process
    Node_SMSFail --> Node_SQLCommit
    Node_SMSNo --> Node_SQLCommit
    
    Node_SQLCommit --> Node_Success200([Retourner Succès 200: Virement Réussi]):::terminal

    %% Gestion de l'erreur globale du bloc d'exécution
    Node_DBConnect -.->|CATCH Erreur Système| Node_GlobalRollback[Exécuter ROLLBACK d'urgence]:::process
    Node_GlobalRollback --> Node_GlobalErr[Retourner Erreur 400: Transaction Annulée]:::terminal
```