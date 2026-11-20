# Proposition — Bannière et préférences de cookies (`locales/fr/legal.ts`, `locales/fr/footer.ts`)

À valider par Mel. Issue #23 « Bannière cookies + consentement ». Mot-clé principal : aucun (texte de service). `title` et `meta description` : sans objet (aucune page). Note de ton : voix du site (pas de « je »), « vous » de politesse, factuel et court, aucun emoji. Les textes sont écrits pour la structure `cookieBanner` de `locales/fr/legal.ts` ; le développeur peut choisir la structure finale des clés, mais doit conserver les textes.

## Faits retenus (décidés par Mel, non rouverts)

- Une seule catégorie non nécessaire : la mesure d'audience (Umami). Umami n'est pas branché dans cette livraison.
- Le choix est mémorisé dans le navigateur (stockage local), jamais dans un cookie, pendant 6 mois. Le site ne dépose aucun cookie.
- Le bandeau n'apparaît que sans choix valide (première visite ou choix expiré).
- Refuser est aussi simple et aussi visible qu'accepter ; aucun interrupteur n'est coché d'avance ; la finalité est énoncée simplement ; lien vers la politique de cookies.

## 1. Bannière (`cookieBanner`) — revue des clés existantes


| Clé                      | Texte                                                                                                                                                          | Décision                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `cookieBanner.ariaLabel` | Choix des cookies                                                                                                                                              | Inchangé.                      |
| `cookieBanner.title`     | Choix des cookies                                                                                                                                              | Inchangé.                      |
| `cookieBanner.body`      | Ce site peut mesurer son audience, uniquement avec votre accord, afin de s'améliorer. Il ne dépose aucun cookie et rien n'est chargé avant votre consentement. | **Modifié** (voir ci-dessous). |
| `cookieBanner.accept`    | Tout accepter                                                                                                                                                  | Inchangé.                      |
| `cookieBanner.decline`   | Tout refuser                                                                                                                                                   | Inchangé.                      |
| `cookieBanner.customize` | Personnaliser                                                                                                                                                  | Inchangé.                      |
| `cookieBanner.learnMore` | Politique de cookies                                                                                                                                           | Inchangé.                      |
| `cookieBanner.saved`     | Votre choix est enregistré.                                                                                                                                    | Inchangé.                      |


Raisons du changement de `body` :

- « Ce site mesure son audience » (présent) laisse croire que la mesure fonctionne déjà ; Umami n'est pas branché. « Peut mesurer » reste vrai avant et après le branchement.
- « Aucun cookie non nécessaire n'est déposé avant votre consentement » est exact mais trompeur : il suggère que des cookies seront déposés après un accord. Or le site ne dépose aucun cookie et Umami n'en utilise pas (conforme à `legal.cookies.audience.body`). La nouvelle phrase dit la vérité simple, sans promettre ce qui n'existe pas.
- La finalité reste énoncée (« mesurer son audience… afin de s'améliorer »), et le texte tient en deux phrases.

Autres clés : « Tout accepter » et « Tout refuser » sont symétriques (même longueur, même registre) ; l'égalité de poids visuel est du ressort du développeur et de `qa` (déjà notée dans le commentaire de `cookieBanner`). « Choix des cookies » est conservé, même si le site ne dépose aucun cookie, parce que le terme est celui que le visiteur reconnaît et celui de la politique liée.

## 2. Panneau de préférences (nouvelles clés)

Fenêtre de dialogue ouverte par « Personnaliser » et par le lien du pied de page. Clés proposées sous `cookieBanner.preferences`.


| Clé                                                 | Texte                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookieBanner.preferences.title`                    | Gérer mes cookies                                                                                                                                                         |
| `cookieBanner.preferences.closeAriaLabel`           | Fermer la fenêtre de gestion des cookies                                                                                                                                  |
| `cookieBanner.preferences.intro`                    | Choisissez ce que ce site peut mémoriser et mesurer. Il ne dépose aucun cookie : votre choix est conservé dans votre navigateur et vous pouvez le modifier à tout moment. |
| `cookieBanner.preferences.necessary.title`          | Stockage strictement nécessaire                                                                                                                                           |
| `cookieBanner.preferences.necessary.status`         | Toujours actif                                                                                                                                                            |
| `cookieBanner.preferences.necessary.description`    | Mémorise dans votre navigateur le thème d'affichage que vous choisissez et votre choix sur cette page. Aucun cookie, rien n'est transmis à un tiers.                      |
| `cookieBanner.preferences.audience.title`           | Mesure d'audience                                                                                                                                                         |
| `cookieBanner.preferences.audience.description`     | Compte les visites et les pages consultées, avec l'outil Umami, pour améliorer le site. Rien n'est chargé sans votre accord. Aucun cookie n'est utilisé.                  |
| `cookieBanner.preferences.audience.toggleAriaLabel` | Autoriser la mesure d'audience                                                                                                                                            |
| `cookieBanner.preferences.audience.stateOn`         | Activée                                                                                                                                                                   |
| `cookieBanner.preferences.audience.stateOff`        | Désactivée                                                                                                                                                                |
| `cookieBanner.preferences.retention`                | Votre choix est conservé 6 mois dans ce navigateur.                                                                                                                       |
| `cookieBanner.preferences.save`                     | Enregistrer mes choix                                                                                                                                                     |
| `cookieBanner.preferences.accept`                   | Tout accepter                                                                                                                                                             |
| `cookieBanner.preferences.decline`                  | Tout refuser                                                                                                                                                              |


Notes :

- **Boutons « Tout accepter » / « Tout refuser »** : je les juge utiles. Avec un seul interrupteur, « Enregistrer mes choix » suffirait, mais « Tout refuser » dans le panneau garantit un refus en un clic, comme dans le bandeau. Les textes sont identiques à `cookieBanner.accept` et `cookieBanner.decline` : le développeur peut réutiliser ces deux clés plutôt que dupliquer. Les trois boutons ont le même poids visuel.
- L'interrupteur est **désactivé par défaut** (aucune case cochée d'avance). À l'ouverture depuis le pied de page avec un choix déjà enregistré, il reflète ce choix.
- La ligne « Stockage strictement nécessaire » n'a pas d'interrupteur : la mention « Toujours actif » remplace le bouton. Elle ne concerne que le thème (enregistré seulement quand le visiteur le choisit) et le choix de cookies lui-même, tous deux dans le navigateur.
- `preferences.title` reprend le texte du lien du pied de page, pour que le visiteur retrouve le même mot en ouvrant la fenêtre.
- Confirmation après enregistrement : réutiliser `cookieBanner.saved` (« Votre choix est enregistré. »), annoncée dans une région `aria-live`.
- Le lien « Politique de cookies » du panneau réutilise `cookieBanner.learnMore`.

## 3. Pied de page — `footer.cookieSettings` restauré


| Clé                     | Texte             |
| ----------------------- | ----------------- |
| `footer.cookieSettings` | Gérer mes cookies |


Même texte que dans `footer-2026-10-04.md`, aucune raison de le changer : c'est aussi le libellé cité par `legal.cookies.choice.body`. Le lien rouvre le panneau de préférences (§2), pas le bandeau. À propager côté code : le commentaire de tête de `locales/fr/footer.ts` (« The cookie-settings link is absent on purpose… ») devient faux et doit être retiré avec le retour de la clé.

## 4. Cohérence des politiques intégrées avec le comportement final

Comportement visé : choix dans le stockage local du navigateur, 6 mois, aucun cookie, Umami non chargé dans cette livraison (branché plus tard, après consentement).

Résultat : **aucune contradiction forte**, mais trois phrases de `legal.cookies` gagnent à être précisées, et une décrit un traitement qui n'existe pas encore. `legal.privacy` : aucune contradiction (voir en bas de section).

**4.1 `legal.cookies.audience.body` — à corriger (affirme un fonctionnement qui n'existe pas encore).** Actuel : « Avec le consentement du visiteur, le site utilise Umami pour compter les visites… ». Le présent affirme une mesure qui ne tourne pas tant qu'Umami n'est pas branché. Proposition :


| Clé                           | Texte                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal.cookies.audience.body` | Avec le consentement du visiteur, le site peut utiliser Umami pour compter les visites et comprendre quelles parties du site sont consultées. Rien n'est chargé avant ce consentement. Umami n'utilise pas de cookie. |


Reste vrai après le branchement d'Umami ; la correction est donc définitive.

**4.2 `legal.cookies.necessary.body` — dernière phrase à préciser (ambiguë).** Actuel : « Le choix de cookies du visiteur est lui aussi mémorisé dans son navigateur, pour ne pas le solliciter à chaque page. » « Dans son navigateur » peut se lire comme un cookie. Proposition de dernière phrase :


| Clé                            | Texte (dernière phrase de `necessary.body`)                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal.cookies.necessary.body` | Le choix de cookies du visiteur est lui aussi mémorisé dans son navigateur (stockage local, sans cookie), pour ne pas le solliciter à chaque page. |


Le reste du paragraphe est inchangé. La clé technique exacte du stockage n'est pas citée ici : elle dépend du code de la livraison ; à ajouter, comme pour « softn-theme », si Mel le souhaite.

**4.3 `legal.cookies.choice.duration` — à compléter (le bandeau revient à l'expiration).** Actuel : « Le choix est conservé pendant 6 mois. » Proposition :


| Clé                             | Texte                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legal.cookies.choice.duration` | Le choix est conservé pendant 6 mois dans le navigateur utilisé, puis le bandeau est de nouveau affiché. Il ne concerne que cet appareil et ce navigateur. |


Raison : un choix en stockage local n'est pas partagé entre navigateurs, et la politique ne dit pas ce qui se passe après 6 mois. `choice.body` (« bandeau affiché lors de la première visite ») reste exact et n'est pas modifié.

**Vérifié sans contradiction :**

- `legal.cookies.intro`, `thirdParty.body`, `browser.body`, `choice.body` : conformes (le lien « Gérer mes cookies » en bas de chaque page existe de nouveau avec cette livraison ; « Refuser est aussi simple qu'accepter » est tenu par le bandeau et le panneau).
- `legal.privacy` (`collected.audience`, `purposes.audience`, `processors.umami`, `processors.supabase`, `transfers.body`) : formulations conditionnelles (« avec le consentement », « chargée uniquement après le consentement ») ; elles restent vraies avant et après le branchement d'Umami. Le choix de cookies, stocké uniquement dans le navigateur et jamais transmis, n'est pas une donnée collectée par le serveur : aucune ligne de durée de conservation à ajouter dans `privacy.retention`.
- `legal.mentions.sections.data.body` : générique, conforme.

## 5. Questions ouvertes pour Mel

1. Valider le changement de `cookieBanner.body` (« peut mesurer… Il ne dépose aucun cookie… »).
2. Les corrections 4.1, 4.2 et 4.3 touchent des textes déjà intégrés : les valider avant que `nextjs-dev` les modifie dans `locales/fr/legal.ts`.
3. L'interrupteur « Mesure d'audience » sera affiché et mémorisé alors qu'Umami n'est pas encore branché : acceptable, ou masquer le panneau jusqu'au suivi ? Ma recommandation : l'afficher, les textes sont écrits pour rester vrais (« peut », « rien n'est chargé sans votre accord »).
4. « Ne dépose aucun cookie » (bandeau et panneau) suppose que l'hébergeur n'en ajoute pas : point déjà signalé à `security` dans `legal-2026-11-18.md`, à confirmer avant publication.
5. Boutons du panneau : garder les trois (« Enregistrer mes choix », « Tout accepter », « Tout refuser ») ou seulement « Enregistrer mes choix » ? Ma recommandation : les trois.

## 6. Révision du 2026-11-20 — titre du bandeau

À valider par Mel. Cible : `cookieBanner.title` (actuel : « Choix des cookies »). Demande : un titre qui porte l'idée de « We value your privacy », en français naturel, sans traduction littérale. Contraintes tenues : « vous » de politesse, voix du site, aucun emoji, 2 à 6 mots (une ligne dans une carte d'environ 40vw), et rien de plus que ce que dit `cookieBanner.body` (mesure d'audience seulement avec accord, aucun cookie, rien chargé avant le consentement).

Écartés : « Nous apprécions votre vie privée » (calque de l'anglais), « Votre vie privée compte pour nous » (formule toute faite des bandeaux, et « nous » laisse penser à une équipe ; le site parle en « je »), « Votre vie privée est notre priorité » (promesse plus large que le texte).

| Option | Texte | Pourquoi |
| ------ | ----- | -------- |
| A | Votre vie privée, votre choix | 5 mots. Porte l'idée « vie privée » et annonce les boutons « Tout accepter » / « Tout refuser » placés juste dessous. Courte, naturelle, ne promet rien de plus que le corps. |
| B | Respect de votre vie privée | 5 mots. Plus sobre, registre institutionnel. Un peu déclaratif : il affirme une qualité du site au lieu de parler du visiteur. |
| C | Vous gardez la main | 4 mots. Le ton le plus chaleureux et le plus oral, fidèle à « chaleureux et expert ». Le mot « vie privée » disparaît : l'idée est suggérée, pas nommée. |
| D | Votre accord avant tout | 4 mots. Colle exactement au corps (« uniquement avec votre accord », « rien n'est chargé avant votre consentement »). « Avant tout » reste exact ici, mais le titre parle de consentement plus que de vie privée. |
| E | Votre vie privée, vous décidez | 5 mots. Variante de A, plus directe. La virgule suivie d'un verbe conjugué est un peu moins fluide que le parallélisme de A. |

**Recommandation : A, « Votre vie privée, votre choix ».** C'est le seul titre qui nomme la vie privée en moins de six mots, sans calque ni promesse excessive : le corps tient ensuite la preuve (aucun cookie, rien avant l'accord). Repli si Mel trouve A trop « slogan » : C, « Vous gardez la main ».

**`cookieBanner.ariaLabel` : garder « Choix des cookies ».** Un libellé de région doit décrire l'objet du bandeau pour un lecteur d'écran (et c'est le terme de la politique et du lien du pied de page), alors que le titre visible devient un message d'accroche ; le lecteur d'écran lira aussi ce titre dans la région, donc rien ne se perd. Cela rend `ariaLabel` et `title` distincts : le développeur ne doit plus les faire pointer vers la même valeur.

Question pour Mel : valider A (ou choisir une autre option) avant que `nextjs-dev` modifie `cookieBanner.title` dans `locales/fr/legal.ts`.