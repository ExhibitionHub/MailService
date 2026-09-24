# MailService

API HTTP générique qui envoie les emails des applications via un serveur SMTP. L'adresse d'expédition reste définie par le service ; les applications fournissent les destinataires, le sujet, le contenu et éventuellement des pièces jointes base64.

## Démarrage

Prérequis : Node.js 20 ou plus récent et un accès SMTP.

```sh
npm ci
copy .env.example .env
npm start
```

Le service écoute par défaut sur `http://localhost:3102`. `GET /health` permet de vérifier son état.

Pour tester sans compte SMTP, Docker Compose démarre aussi Mailpit :

```sh
docker compose up --build
```

- API : `http://localhost:3102`
- boîte de réception Mailpit : `http://localhost:8025`
- clé API locale : `local-development-key`

## Envoyer un email

```sh
curl -X POST http://localhost:3102/v1/emails \
  -H "Content-Type: application/json" \
  -H "X-API-Key: local-development-key" \
  -d '{
    "to": "visiteur@example.com",
    "subject": "Votre création",
    "text": "Votre image est prête.",
    "html": "<p>Votre image est <strong>prête</strong>.</p>"
  }'
```

Réponse acceptée :

```json
{
  "ok": true,
  "messageId": "identifiant-smtp"
}
```

Champs acceptés :

- `to` : adresse ou tableau d'adresses, obligatoire ;
- `cc`, `bcc` : adresse ou tableau facultatif ;
- `subject` : obligatoire ;
- `text` ou `html` : au moins un des deux ;
- `replyTo` : adresse facultative ;
- `attachments` : au maximum huit objets `{ filename, contentType, contentBase64 }`.

Exemple de pièce jointe :

```json
{
  "to": "visiteur@example.com",
  "subject": "Votre dinosaure",
  "text": "Votre dinosaure est en pièce jointe.",
  "attachments": [
    {
      "filename": "dino.png",
      "contentType": "image/png",
      "contentBase64": "iVBORw0KGgo..."
    }
  ]
}
```

## Configuration SMTP

Copier `.env.example` vers `.env`, puis renseigner :

- `SMTP_HOST`, `SMTP_PORT` et `SMTP_SECURE` ;
- `SMTP_USER` et `SMTP_PASS` si le serveur demande une authentification ;
- `MAIL_FROM` et `MAIL_FROM_NAME` ;
- `MAIL_API_KEY` pour autoriser les applications ;
- `CORS_ORIGINS` si l'API est appelée directement depuis un navigateur.

Pour le port 465, utiliser généralement `SMTP_SECURE=true`. Pour le port 587, utiliser `SMTP_SECURE=false`; STARTTLS est alors négocié par Nodemailer si le serveur le propose. `SMTP_REQUIRE_TLS=true` permet de l'imposer.

La clé API est facultative pour faciliter le développement local. Ne pas exposer le service sur Internet sans `MAIL_API_KEY` : une API SMTP ouverte serait rapidement utilisée pour envoyer du spam.

La configuration historique `ExhibitionHubLauncher/email.config.json` contient déjà les équivalents de `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` et `MAIL_FROM`. Recopier ces valeurs uniquement dans le `.env` privé du serveur, jamais dans le dépôt.

Pour lancer la validation : `npm run check`.
