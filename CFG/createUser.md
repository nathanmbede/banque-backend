```mermaid
flowchart TD
    A[Début] --> B[Réception nom, email]
    B --> C{Tentative INSERT INTO clients}
    C -->|Succès| D[Retour 201: Utilisateur créé]
    C -->|Erreur SQL| E[Retour 500: Erreur serveur]
    D --> F[Fin]
    E --> F
```