# Proposition — Page « bientôt en ligne » (`/`) : nouveau design avec inscription par e-mail

À valider par Mel. Issue #91. Remplace et complète `docs/content-proposals/coming-soon-2026-10-23.md` pour le design « Softn.io Coming Soon ».

Mot-clé principal : **automatisation** (secondaire : **agents IA**). Périmètre : toute la France. `docs/seo-brief.md` n'existe pas : les mots-clés viennent de `CLAUDE.md`, de `docs/brand-voice.md` et de `locales/fr/metadata.ts`. Aucun volume de recherche mesuré.

Note de ton : « je » (Mel) et « vous », phrases courtes, aucun emoji, aucune date de lancement, aucun chiffre, aucune promesse. Les longueurs sont comptées à la main (≈) ; à recompter au lint.

Texte du design lu dans `docs/design/project/Softn.io Coming Soon.dc.html` (contenu visible et script). Texte actuel : `locales/fr/comingSoon.ts` (clés `eyebrow`, `title`, `body`, `caption`) et `locales/fr/metadata.ts` (`comingSoon`).

Évolutions de structure à prévoir dans `locales/fr/comingSoon.ts` : `caption` (« Ce site est en cours de construction. ») n'apparaît plus dans le design, donc plus de texte pour cette clé ; les nouvelles clés sont regroupées sous `comingSoon.form` et `comingSoon.footer`.

## 1. Pastille (eyebrow)

| Clé | Design | Recommandé (A) | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.eyebrow` | Lancement prochain | **Lancement prochain** (design conservé) | 18 car. | Court, sans date ni promesse ; remplace « Bientôt en ligne » sans perdre l'honnêteté. |

## 2. Titre principal (unique `<h1>`)

| Clé | Design | Recommandé (A) | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.title` | Votre site, vos apps, vos automatisations. | **Votre site, vos apps, vos automatisations.** (design conservé) | 42 car. | Part du lecteur, contient « automatisations » ; « agents IA » est porté par la phrase d'appui (B) et les métadonnées. |

Le gros logotype « softn.io » du design est décoratif (`aria-hidden`) : ce n'est pas du texte à proposer, c'est le logo. Le lien du logo dans l'en-tête (`aria-label="softn.io"`) reprend le libellé existant du logo de `locales/fr/hero.ts` (`nav`, voir la proposition du 23/10) ; clé exacte à confirmer par `nextjs-dev`.

## 3. Phrase d'appui

« Construits avec l'IA, mis en place avec vous. » et « être prévenu » : l'accord au masculin (« prévenu ») exclut une partie des lecteurs, et « construits » est ambigu (accord avec quoi ?). Le « je » de Mel règle les deux : on évite le participe passé.

| Clé | Variante | Texte | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.body` | Design | Construits avec l'IA, mis en place avec vous. Le nouveau site arrive bientôt : laissez votre e-mail pour être prévenu à l'ouverture. | ≈133 car. | Référence ; « prévenu » est genré. |
| `comingSoon.body` | **A (recommandée)** | Je construis tout avec l'IA et je le mets en place avec vous. Le nouveau site arrive bientôt : laissez votre e-mail, je vous écris à l'ouverture. | ≈145 car. | Neutre en genre, à la première personne comme le reste du site, et cohérent avec le message de succès (« Je vous écris… »). |
| `comingSoon.body` | B | Je construis votre site, vos apps et vos automatisations avec l'IA, des agents IA compris. Le nouveau site arrive bientôt : laissez votre e-mail, je vous écris à l'ouverture. | ≈172 car. | Ajoute « agents IA » (SEO) et nomme l'offre ; plus long pour une page à l'écran unique. |

## 4. Formulaire d'inscription par e-mail

Clés sous `comingSoon.form`.

| Clé | Design | Recommandé (A) | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.form.label` | E-mail | **E-mail** (design conservé) | 6 car. | Libellé masqué visuellement mais lu par les lecteurs d'écran ; clair et court. |
| `comingSoon.form.placeholder` | vous@entreprise.fr | **vous@exemple.fr** | 15 car. | « entreprise » exclut les indépendants et les particuliers ; « exemple » est neutre. Le placeholder ne remplace pas le label. |
| `comingSoon.form.submit` | Me prévenir | **Me prévenir** (design conservé) | 11 car. | Verbe d'action à la première personne côté lecteur, comme les CTA de `docs/brand-voice.md`. « Prévenir » à l'infinitif n'est pas genré. |
| `comingSoon.form.submitBusy` | (aucun, état `loading` du bouton) | **Envoi en cours…** | 15 car. | Annoncé aux lecteurs d'écran pendant l'envoi (à brancher sur `aria-live` ou le label du bouton). |
| `comingSoon.form.reassurance` | Un seul e-mail, à l'ouverture. Rien d'autre. | **Un seul e-mail, à l'ouverture. Rien d'autre.** (design conservé) | 44 car. | Direct, rassurant, sans promesse excessive ; cohérent avec la mention RGPD (§5). |
| `comingSoon.form.errorEmpty` | Indiquez votre adresse e-mail. | **Indiquez votre adresse e-mail.** (design conservé) | 31 car. | « Vous » formel, dit quoi faire. |
| `comingSoon.form.errorInvalid` | Cette adresse e-mail n'est pas valide. | **Cette adresse e-mail n'est pas valide.** (design conservé) | 38 car. | Clair, sans reproche. |
| `comingSoon.form.errorServer` | (nouveau, absent du design) | **L'inscription n'a pas abouti. Réessayez dans un instant.** | 56 car. | Honnête et actionnable ; couvre erreur serveur et réseau. |
| `comingSoon.form.errorServer` | | B : Un problème est survenu de mon côté. Réessayez dans un instant. | 67 car. | Plus personnel (« mon côté »), mais attribue la faute alors que la cause peut être le réseau du visiteur. |
| `comingSoon.form.success` | C'est noté. Je vous écris à {email} au lancement. | **C'est noté. Je vous écris à {email} au lancement.** (design conservé, placeholder `{email}` gardé) | ≈49 car. + e-mail | Personnel, confirme l'adresse. À interpoler avec `lib/interpolate.ts` ; l'e-mail saisi est affiché tel quel, à échapper (React le fait) et à ne jamais journaliser. |

Remarque sur le succès : le design affiche le message de succès aussi quand le champ piège (honeypot) est rempli ou quand l'envoi est trop rapide (< 2 s) ; c'est volontaire côté anti-spam, pas un texte supplémentaire. Le texte « au lancement » ne fixe aucune date.

## 5. Mention RGPD sous le formulaire (nouvelle)

| Clé | Variante | Texte | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.form.privacyNotice` | **A (recommandée)** | Votre adresse est enregistrée chez Airtable, mon prestataire, uniquement pour vous envoyer cet e-mail de lancement. Vous pouvez en demander la suppression à tout moment. | ≈167 car. | Dit qui, pourquoi et le droit de suppression, sans jargon ni lien (la politique de confidentialité n'est pas en ligne). |
| `comingSoon.form.privacyNotice` | B | Adresse enregistrée chez Airtable, utilisée uniquement pour cet e-mail de lancement. Suppression possible sur simple demande. | ≈125 car. | Plus court pour l'écran unique, ton plus télégraphique. |

Points à trancher par Mel avant intégration :

- **Canal de demande de suppression** : aucune adresse e-mail ni formulaire n'existe dans `locales/fr/` et je n'en invente aucune. « Sur demande » n'est crédible que si un moyen de contact existe en production au lancement de cette page ; sinon, adapter ou retirer la deuxième phrase.
- **Durée de conservation** : non définie. Je n'écris donc ni « supprimée après l'envoi » ni durée. À préciser ici et dans la politique de confidentialité quand elle existera.
- **Hébergement et garanties d'Airtable** : « À vérifier » dans `docs/rgpd/processors.md` ; la mention n'affirme rien sur le lieu d'hébergement.
- La phrase de réassurance (§4) et cette mention disent la même chose sous deux angles ; si l'espace manque, la mention peut suivre directement la réassurance sur la même ligne.

## 6. Bouton de thème (libellé accessible)

| Clé | Design | Recommandé (A) | Justification |
|---|---|---|---|
| `nav.themeToggle.toLight` / `nav.themeToggle.toDark` (**réutilisation par référence**, `locales/fr/hero.ts`) | Changer de thème (libellé fixe) | **Passer au mode clair** / **Passer au mode sombre** (textes existants, aucun nouveau texte) | Disent l'action et l'état cible, ce que « Changer de thème » ne fait pas. Même composant `ThemeToggle` que le reste du site. |

Aucune nouvelle clé n'est nécessaire.

## 7. Pied de page

| Clé | Design | Recommandé (A) | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.footer.copyright` | © 2026 softn.io | **© {year} softn.io** | ≈17 car. | Texte du design conservé, mais l'année est un paramètre calculé (`{year}`), jamais écrite en dur (même règle que `footer.copyright`). |
| `footer.copyright` (B, référence) | | © {year} softn.io. Tous droits réservés. | ≈41 car. | Réutilise le texte existant sans nouvelle clé ; plus long que ce que montre le design. |

Les liens Contact et Mentions légales du design sont masqués tant que leurs routes n'existent pas : aucun texte proposé.

## 8. Champ piège anti-spam (honeypot)

| Clé | Design | Recommandé (A) | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.form.honeypotLabel` | (aucun, champ `site` sans label, dans un conteneur `aria-hidden`, `tabindex="-1"`) | **Ne pas remplir ce champ** | 23 car. | Un champ sans label peut faire échouer l'audit d'accessibilité ; ce label masqué suffit si le champ reste hors de portée des lecteurs d'écran et du clavier. |

Note technique pour `nextjs-dev` : le nom `site` peut être rempli par un gestionnaire de mots de passe ; un nom neutre est préférable (hors périmètre copy).

## 9. Métadonnées de `/` (indexée : `index, follow`)

| Clé | Actuel | Recommandé | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.meta.title` | Softn.io \| Automatisation et agents IA, bientôt en ligne | **Inchangé** | 56 car. | Mots-clés en tête, honnête, ≲ 60. |
| `comingSoon.meta.description` | Je crée votre site et vos web apps, et j'automatise vos tâches répétitives avec des agents IA. Le site complet de Softn.io arrive bientôt. | **Sites, web apps, automatisation et agents IA. Le nouveau site arrive bientôt : laissez votre e-mail, je vous écris à l'ouverture.** | ≈129 car. | Aligne la description sur le nouveau h1 et sur l'inscription, reste ≲ 155. L'actuelle (138 car.) reste valable si Mel préfère ne pas mentionner l'inscription. |
| `comingSoon.meta.openGraph.title` | Softn.io : sites, web apps, automatisation et agents IA | **Inchangé** | 55 car. | Cohérent avec le h1 et avec `metadataContent.home`. |
| `comingSoon.meta.openGraph.description` | Création de sites et d'applications, automatisation avec des agents IA. Le site complet de Softn.io arrive bientôt. | **Inchangé** | ≈115 car. | Toujours exact ; pas d'appel à l'action nécessaire dans un aperçu de partage. |

## Points pour Mel

- Corps du texte : A (« Je construis tout… ») ou B (avec « agents IA »), ou design conservé malgré « prévenu ».
- Mention RGPD : variante A ou B, et **canal de demande de suppression** à définir (aucun n'existe dans le dépôt).
- Message d'erreur serveur : A ou B.
- Pied de page : `{year}` seul (A) ou réutilisation de `footer.copyright` (B).
- Description de `/` : mise à jour proposée ou conservation de l'actuelle.
- Hypothèses : aucune date de lancement ; le libellé de loading est annoncé sans `aria-live` imposé ici (choix d'implémentation).
