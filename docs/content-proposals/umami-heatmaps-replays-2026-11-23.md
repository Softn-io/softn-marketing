# Proposition — Umami : cartes de chaleur et replays de sessions (`locales/fr/legal.ts`), issue #24

À valider par Mel. Le texte actuel dit seulement qu'Umami compte les visites et les pages vues, sans cookie : c'est devenu inexact, car Umami charge aussi un enregistreur (cartes de chaleur et replays de sessions).

Mot-clé principal : sans objet (pages légales). Note de ton : « vous » pour le visiteur, formulation impersonnelle comme le reste de `legal.ts` (la bannière dit « ce site »), aucun chiffre inventé (pas de pourcentage d'échantillonnage : « une partie des visites »), pas de promesse absolue (on décrit le masquage et les exclusions, on ne parle pas d'« anonymat » garanti). Seule catégorie de consentement : « Mesure d'audience » (aucune nouvelle catégorie).

Faits décrits (décidés par Mel) : le traceur (visites et pages, sans cookie) et l'enregistreur (cartes de chaleur = clics et défilement agrégés par page ; replays = reconstitution du parcours : mouvements de souris, clics, défilement, contenu de la page). Masquage strict : tous les champs de saisie et tous les textes sont masqués. Assistant, réservation et formulaire de contact exclus de l'enregistrement. Seule une partie des visites est enregistrée ; un replay s'arrête au bout de 5 minutes maximum ; Umami conserve les replays 30 jours. Rien n'est chargé avant le consentement.

Convention : les clés marquées **(nouvelle)** n'existent pas encore. Chaque phrase reste dans sa propre clé (pas de concaténation, structure prête pour l'anglais).

## 1. Bannière : `cookieBanner.body`

|               | Texte                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actuel        | Ce site peut mesurer son audience afin de s'améliorer, uniquement avec votre accord.\\nIl ne dépose aucun cookie.                                                                              |
| Proposé       | Ce site peut mesurer son audience (visites, clics, parcours enregistrés avec les textes et les champs masqués) afin de s'améliorer, uniquement avec votre accord.\\nIl ne dépose aucun cookie. |
| Mel's comment | Ce site peut mesurer son audience afin de s'améliorer, uniquement avec votre accord.\\nIl ne dépose aucun cookie.                                                                              |

Raison : la bannière reste courte (une phrase de plus qu'avant, pas de paragraphe), mais le mot « parcours enregistrés » rend l'enregistrement visible dès le premier écran. Le détail est dans la politique de cookies (lien `learnMore` déjà présent).

## 2. Fenêtre de préférences : `cookieBanner.preferences.audience.description`

|               | Texte                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actuel        | Compte les visites et les pages consultées, avec l'outil Umami, pour améliorer le site. Rien n'est chargé sans votre accord. Aucun cookie n'est utilisé.                                                                                                                                                                                                                                                                                           |
| Proposé       | Avec l'outil Umami : compte les visites et les pages consultées, et cartographie les clics et le défilement. Une partie des visites est aussi enregistrée sous forme de replay : un rejeu de votre parcours (souris, clics, défilement) dont les textes et les champs de saisie sont masqués. L'assistant, la réservation et le formulaire de contact ne sont jamais enregistrés. Rien n'est chargé sans votre accord. Aucun cookie n'est utilisé. |
| Mel's comment | Avec l'outil Umami : compte les visites et les pages consultées, cartographie les clics et le défilement. Une partie des visites est enregistrée sous forme de replay (les textes et les champs de saisie sont masqués.).                                                                                                                                                      Rien n'est chargé sans votre accord. Aucun cookie n'est utilisé.    |

Raison : c'est ici, au moment du choix, que la personne décide de la catégorie unique « audience » ; on y nomme donc les trois dispositifs et les exclusions. Le détail (durée, échantillon) reste dans la politique de cookies.

`cookieBanner.preferences.intro` (« Choisissez ce que ce site peut mémoriser et mesurer. Il ne dépose aucun cookie… ») : **inchangé**, toujours exact.

## 3. Politique de cookies : `cookies.audience`

Actuel : une seule clé.

| Clé | Texte actuel | Texte proposé |
|---|---|---|
| `cookies.audience.body` | Avec le consentement du visiteur, le site peut utiliser Umami pour compter les visites et comprendre quelles parties du site sont consultées. Rien n'est chargé avant ce consentement. Umami n'utilise pas de cookie. | Avec le consentement du visiteur, le site utilise Umami pour mesurer son audience. Rien n'est chargé avant ce consentement. Deux scripts sont alors chargés depuis softn.io, sans cookie. |
| `cookies.audience.tracker` **(nouvelle)** | | Le premier compte les visites et les pages consultées, pour comprendre quelles parties du site sont lues. |
| `cookies.audience.heatmaps` **(nouvelle)** | | Le second produit des cartes de chaleur : les clics et la profondeur de défilement sont regroupés par page, pour repérer ce qui est cliqué ou ignoré. |
| `cookies.audience.replays` **(nouvelle)** | | Il permet aussi d'enregistrer une partie des visites sous forme de replay : une reconstitution du parcours sur la page (mouvements de la souris, clics, défilement, contenu de la page), pour repérer ce qui gêne la navigation. Un replay s'arrête automatiquement au bout de 5 minutes au plus. |
| `cookies.audience.masking` **(nouvelle)** | | L'enregistrement est configuré avec un masquage strict : tous les champs de saisie et tous les textes de la page sont masqués. L'assistant virtuel, la réservation et le formulaire de contact sont entièrement exclus de l'enregistrement. |
| `cookies.audience.retention` **(nouvelle)** | | Les replays sont conservés 30 jours par Umami, puis supprimés. |

Raison : la clé `body` d'origine devient une introduction ; chaque fait a sa clé pour être réordonné ou traduit sans concaténation. Rendu attendu : un paragraphe (`body`) suivi d'une courte liste ou de paragraphes (`tracker`, `heatmaps`, `replays`, `masking`, `retention`).

### Option : `cookies.choice` (retrait du consentement)

| Clé                                                     | Texte actuel                                                                                                                                                                                                                                                                                                          | Texte proposé                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `cookies.choice.body`                                   | Les cookies et dispositifs de mesure non nécessaires ne sont activés qu'avec l'accord du visiteur, recueilli par un bandeau affiché lors de la première visite. Refuser est aussi simple qu'accepter. Le choix peut être modifié ou retiré à tout moment depuis le lien « Gérer mes cookies », en bas de chaque page. | **Inchangé.**                                                                                          |
| `cookies.choice.withdrawal` **(nouvelle, facultative)** |                                                                                                                                                                                                                                                                                                                       | Si vous désactivez la mesure d'audience, elle s'arrête au plus tard au chargement de la page suivante. |

À garder seulement si Mel confirme que c'est le comportement réel (voir « Points à vérifier », n° 3). Sinon, ne pas l'ajouter. 

## 4. Politique de confidentialité : `privacy.collected.audience`

| | Texte |
|---|---|
| Actuel | Avec le consentement du visiteur : statistiques de navigation, pour comprendre comment le site est utilisé. Cette mesure n'est active qu'après l'accord du visiteur. |
| Proposé | Avec le consentement du visiteur : statistiques de navigation (pages consultées, type d'appareil et de navigateur) et, pour une partie des visites, données d'interaction : clics, défilement, mouvements de la souris et contenu de la page, enregistrés sous forme de cartes de chaleur et de replays. Les textes et les champs de saisie sont masqués ; l'assistant, la réservation et le formulaire de contact ne sont pas enregistrés. Ces mesures ne sont actives qu'après l'accord du visiteur. |

Raison : la liste des données collectées doit nommer ce que l'enregistreur capte réellement. « Type d'appareil et de navigateur » est à confirmer (voir « Points à vérifier », n° 4) ; sinon le retirer pour s'en tenir à « pages consultées ».

## 5. Politique de confidentialité : `privacy.purposes.audience`

| | Texte |
|---|---|
| Actuel | Mesurer l'audience du site. Base légale : consentement, recueilli par le bandeau de cookies. |
| Proposé | Mesurer l'audience du site et comprendre comment il est utilisé (pages vues, zones cliquées, parcours) afin de l'améliorer. Base légale : consentement, recueilli par le bandeau de cookies, qui couvre à la fois les statistiques, les cartes de chaleur et les replays. |

## 6. Politique de confidentialité : `privacy.processors.umami`

| | Texte |
|---|---|
| Actuel | Umami : mesure d'audience, chargée uniquement après le consentement du visiteur. Application hébergée sur Vercel (fonctions à Paris) ; transfert encadré par le Data Privacy Framework (UE–États-Unis). |
| Proposé | Umami : mesure d'audience, cartes de chaleur et replays de sessions, chargés uniquement après le consentement du visiteur. Application hébergée sur Vercel (fonctions à Paris) ; transfert encadré par le Data Privacy Framework (UE–États-Unis). |

## 7. Politique de confidentialité : `privacy.processors.supabase`

| | Texte |
|---|---|
| Actuel | Supabase : stockage des statistiques de la mesure d'audience Umami, après consentement du visiteur. Données hébergées en Irlande (Union européenne) ; transfert encadré par les clauses contractuelles types de la Commission européenne. |
| Proposé | Supabase : stockage des statistiques, des cartes de chaleur et des replays de la mesure d'audience Umami, après consentement du visiteur. Données hébergées en Irlande (Union européenne) ; transfert encadré par les clauses contractuelles types de la Commission européenne. |

## 8. Politique de confidentialité : `privacy.retention`

Aucune entrée n'existe pour l'audience. Ajout :

| Clé | Texte actuel | Texte proposé |
|---|---|---|
| `privacy.retention.audienceReplays` **(nouvelle)** | | Replays de sessions : 30 jours, puis suppression. Un replay dure 5 minutes au plus. |
| `privacy.retention.audienceStats` **(nouvelle, à confirmer)** | | Statistiques et cartes de chaleur agrégées : *durée à renseigner par Mel* (voir « Points à vérifier », n° 1). |

## 9. Politique de confidentialité : `privacy.security.body`

La phrase finale « Aucune donnée personnelle n'est placée dans les journaux ni dans les mesures d'audience. » devient trop affirmative : un replay capte des mouvements et le contenu non textuel de la page, même masqué.

| | Texte |
|---|---|
| Actuel | …Les accès aux outils sont protégés. Aucune donnée personnelle n'est placée dans les journaux ni dans les mesures d'audience. |
| Proposé | …Les accès aux outils sont protégés. Aucune donnée personnelle n'est placée dans les journaux. Les enregistrements d'audience masquent tous les textes et tous les champs de saisie, et excluent l'assistant, la réservation et le formulaire de contact. |

(Le début de la clé, avant « Les accès aux outils… », est inchangé.)

## 10. Clés relues et laissées inchangées

- `privacy.transfers.body` : cite déjà Umami (hébergé sur Vercel) et Supabase, hors UE avec garanties. Toujours exact.
- `privacy.rights.*` : le retrait du consentement et le droit d'opposition y sont déjà décrits.
- `cookies.thirdParty.body`, `cookies.necessary.body`, `mentions.sections.data` : aucune mention d'audience à modifier.
- `cookieBanner.preferences.retention` et `cookies.choice.duration` : durée du choix (6 mois), sans rapport avec les replays.

## Points à vérifier par Mel (juridique)

1. **Durée de conservation des statistiques.** Rien n'est dit aujourd'hui pour les statistiques Umami (la rétention n'existe pas dans `privacy.retention`). Seule la durée des replays (30 jours) m'a été donnée. Les statistiques agrégées sont stockées chez Supabase sans limite visible : à trancher (durée, ou suppression automatique), puis à indiquer ici. Vérifier aussi les recommandations de la CNIL sur la durée de conservation des données de mesure d'audience (non vérifiées ici, aucun chiffre avancé).
2. **Exemption de consentement de la mesure d'audience.** Le traceur seul pourrait, sous conditions strictes de la CNIL, se passer de consentement ; les replays et cartes de chaleur n'en bénéficient pas (ils sortent d'une « mesure strictement statistique »). Le choix de tout placer derrière le consentement est donc le plus prudent, et cohérent avec la décision de ne pas créer de catégorie.
3. **Retrait du consentement.** Vérifier que la désactivation arrête réellement l'enregistreur (au plus tard au prochain chargement de page). Si ce n'est pas le cas, ne pas ajouter `cookies.choice.withdrawal`, et corriger le comportement avant de publier.
4. **Données réellement captées.** Confirmer ce que le traceur et l'enregistreur envoient (type d'appareil, navigateur, taille d'écran, pays déduit de l'adresse IP, adresse IP ou non) et ajuster `privacy.collected.audience` en conséquence. Confirmer aussi que l'enregistreur n'écrit rien dans les cookies, le stockage local ni le stockage de session : la formule « Aucun cookie » (bannière, préférences, cookies) en dépend, et l'écriture d'un identifiant de session ou de replay en stockage local resterait un traceur soumis au consentement, à mentionner dans la politique de cookies.
5. **Masquage et données sensibles.** « Masquage strict » protège les textes et les champs, pas les images, ni la mise en page, ni la position de la souris. Aucune donnée de santé ou autre catégorie particulière n'est affichée par le site (à ma connaissance), donc pas de point bloquant. Un test visuel d'un replay avant mise en production reste utile pour vérifier que rien n'est lisible.
6. **Registre et analyse d'impact.** Les replays (même masqués) sont un traitement plus intrusif que du simple comptage : à consigner dans le registre des traitements et dans `docs/rgpd/processors.md` (lignes Umami et Supabase : données, durée de 30 jours).
7. **Date « Dernière mise à jour ».** Les paramètres `{date}` des deux pages doivent être mis à jour à l'intégration.
8. **`CLAUDE.md`.** La phrase du projet du projet décrit Umami comme « chargé après consentement » ; elle reste valable, mais gagnerait à mentionner traceur + enregistreur.
