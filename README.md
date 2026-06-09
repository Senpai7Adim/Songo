# Songo — Mancala camerounais

Jeu de **Songo** (variante camerounaise du mancala) jouable en solo, en local à deux sur le même écran, ou en ligne à distance.

## Démarrage rapide

```bash
cd Songo
npm install
npm start
```

Ouvrez **http://localhost:3000** dans le navigateur (Firefox, Chrome, etc.).

> **Important :** le mode en ligne nécessite le serveur Node.js. N'ouvrez pas le fichier HTML directement (`file://`).

## Modes de jeu

| Mode | Description |
|------|-------------|
| **Solo vs Ordinateur** | Jouez contre l'IA (facile, moyen, difficile) |
| **Local à 2 joueurs** | Même écran, tour par tour — J1 en bas (doré), J2 en haut (bleu) |
| **En ligne** | Deux joueurs sur des appareils différents, via un code de salle |

### Jouer en ligne

1. Les deux joueurs ouvrent **la même adresse** (ex. `http://localhost:3000` ou votre URL Render).
2. **Joueur 1** → En ligne → Créer une salle → note le code (ex. `ABC123`).
3. **Joueur 2** → En ligne → entre le code → Rejoindre.
4. Joueur 1 commence. Chacun joue ses fosses **en bas** de son écran.

## Règles du Songo

- **Objectif :** accumuler le plus de graines dans votre grenier.
- **Coup :** cliquez une fosse pour distribuer ses graines une par une dans le sens **antihoraire**.
- **Tour bonus :** si la dernière graine tombe dans votre grenier → vous rejouez.
- **Capture :** dernière graine dans une fosse vide de votre côté + graines en face → vous capturez tout.
- **Fin :** quand un côté est vide, chacun ramasse le reste. Le plus de graines gagne.

## Déconnexion en ligne

Le jeu gère les départs imprévus :

| Situation | Comportement |
|-----------|--------------|
| **Fermeture d'onglet / coupure réseau** | La partie est **mise en pause** 90 secondes. L'autre joueur voit un compte à rebours. |
| **Reconnexion dans les 90 s** | Rouvrez la même URL — la session est restaurée automatiquement et la partie reprend. |
| **Délai dépassé** | La partie se termine (« adversaire pas revenu à temps »). |
| **Quitter via Menu** | L'adversaire est notifié immédiatement (« adversaire a quitté »). |

Pendant la pause, aucun coup n'est possible.

## Déploiement sur Render

1. Poussez le projet sur GitHub.
2. Sur [render.com](https://render.com) → **New → Blueprint** (ou Web Service).
3. Connectez le dépôt — le fichier `render.yaml` configure le service.
4. Partagez l'URL Render aux deux joueurs (ex. `https://songo-xxxx.onrender.com`).

### Variables

| Variable | Valeur |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | défini automatiquement par Render |

## Structure du projet

```
Songo/
├── server.js          # Serveur Express + Socket.io
├── package.json
├── render.yaml        # Config Render
├── public/
│   └── index.html     # Jeu (interface + logique client)
└── README.md
```

## Dépannage

| Problème | Solution |
|----------|----------|
| « Non connecté au serveur » | Lancez `npm start`, ouvrez `http://localhost:3000` |
| Erreur WebSocket Firefox | Vérifiez que le serveur tourne ; rechargez la page |
| Port 3000 occupé | `kill $(lsof -ti :3000)` puis `npm start` |
| En ligne ne fonctionne pas | Les deux joueurs doivent utiliser **la même URL** |
| Partie bloquée après déconnexion | Attendez la reconnexion (90 s) ou retournez au menu |

## Technologies

- **Frontend :** HTML, CSS, JavaScript
- **Backend :** Node.js, Express, Socket.io
- **Hébergement :** Render (gratuit)

## Licence

Projet libre — usage personnel et éducatif.
