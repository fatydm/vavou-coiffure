# vavou-coiffure

## Déploiement Vercel

Le fichier `api/reservations.js` expose `POST /api/reservations` comme fonction Node Vercel, sur le même domaine que le formulaire. Le serveur local n’est pas requis en production. La fonction utilise les variables d’environnement `MAKE_BOOKING_WEBHOOK_URL` et `MAKE_BOOKING_API_KEY` déjà configurées dans Vercel.

Après avoir poussé les changements, Vercel redéploie le site et détecte la fonction sous `api/`. Aucune modification de configuration n’est nécessaire si le projet déploie bien les fichiers du dépôt et si ces deux variables sont définies pour l’environnement (Production, ou Preview pour une prévisualisation).

## Développement local

Pour servir le site et sa route API localement avec Node.js 18 ou plus récent :
```sh
MAKE_BOOKING_WEBHOOK_URL="https://hook.eu1.make.com/URL_DU_WEBHOOK" \
MAKE_BOOKING_API_KEY="VOTRE_CLE_MAKE" \
node server.js
```

Ouvrir ensuite `http://localhost:3000`. Les deux variables sont lues uniquement par le serveur et ne sont jamais envoyées au navigateur. Ne publiez pas ces valeurs dans le dépôt.

La route `POST /api/reservations` valide les huit champs et les tarifs/durées du catalogue avant d’appeler Make. Pour qu’une demande soit annoncée comme confirmée, configurez le scénario Make pour répondre avec un JSON contenant une référence enregistrée, par exemple `{"reference":"VAV-123"}`. Une réponse HTTP réussie sans `reference` (ou `reservationReference`) est affichée comme « Demande transmise », pas comme une réservation confirmée.

## Tests sans réservation réelle

Les tests remplacent l’appel réseau à Make par une fonction simulée, y compris pour le handler Vercel, et ne contactent aucun webhook :

```sh
node --test server.test.js
```

Pour tester depuis le site déployé sans créer de rendez-vous en production, utilisez une Preview Vercel reliée à un scénario/webhook de test Make. Remplissez le formulaire et cliquez sur « Confirmer ma réservation » : vérifiez la requête dans Make et la réponse affichée. Make doit renvoyer `{"reference":"..."}` uniquement après l’enregistrement effectif du rendez-vous. La production peut ensuite être vérifiée avec une réservation réelle contrôlée.
