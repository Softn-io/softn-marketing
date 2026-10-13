# Libellés ARIA de la navigation du header (tâche #9)

**À valider par Mel**

- Section : header, navigation (desktop et menu mobile)
- Mot-clé principal : sans objet (libellés d'accessibilité, aucun enjeu SEO direct)
- `title` / `meta description` : sans objet (pas de page)
- Cible : `locales/fr/hero.ts`, objet `nav`

## Règle appliquée

WCAG 2.5.3 (Label in Name) : chaque `aria-label` commence par le texte visible, à l'identique (casse et accents compris), puis ajoute le contexte de destination après une virgule. Vouvoiement respecté. Aucun mot-clé ajouté, aucune ponctuation autre que la virgule.

## Liens de navigation

Clés proposées : `nav.itemsAriaLabel.<clé>`, à côté de `nav.items` existant. `{assistantName}` est interpolé comme pour le libellé visible (le préfixe reste donc identique au texte affiché).

| Clé | Texte visible (validé) | Option A | Option B | Choix |
|---|---|---|---|---|
| `offers` | Comment je vous aide | Comment je vous aide, services pour votre activité | Comment je vous aide, créer et automatiser | **A** |
| `method` | Du cadrage au suivi | Du cadrage au suivi, un projet suivi pas à pas | Du cadrage au suivi, ma méthode de travail | **B** |
| `agent` | Demandez à {assistantName} | Demandez à {assistantName}, l'assistant virtuel IA | Demandez à {assistantName}, discuter avec l'assistant | **A** |
| `thisSite` | En coulisses | En coulisses, comment ce site a été construit | En coulisses, la construction de ce site avec des agents IA | **A** |
| `faq` | FAQ | FAQ, questions fréquentes | FAQ, questions fréquentes sur les services | **A** |

Justification des choix :

- `offers` A reprend l'intitulé de la section (`nav.offers`), donc cohérent avec ce que le lecteur d'écran annoncera en arrivant sur la section.
- `method` B évite la répétition « suivi / suivi » de l'option A.
- `agent` A rappelle qu'il s'agit d'un assistant IA (transparence), sans promettre l'ouverture immédiate d'une discussion : le lien mène à la section.
- `thisSite` A est la formulation la plus directe (45 caractères).
- `faq` A développe le sigle sans le répéter inutilement.

Toutes les propositions font 60 caractères ou moins une fois `{assistantName}` remplacé par un prénom court ; seule l'option B de `thisSite` les dépasse (hors choix).

## Repères de navigation (`<nav>`)

Les deux repères ne sont jamais exposés en même temps (l'un est masqué selon la largeur), mais leurs noms doivent rester distincts de toute façon, et distincts du repère du pied de page (`footer.nav.ariaLabel` : « Liens du pied de page »).

| Clé | Existant | Proposition | Choix |
|---|---|---|---|
| `nav.ariaLabel` (nav desktop) | absent | **Navigation principale** | A |
| `nav.menu.ariaLabel` (nav du menu mobile) | « Menu » | **Menu de navigation** | A |

Notes :

- Ne pas écrire « navigation » dans l'`aria-label` d'un `<nav>` : le lecteur d'écran annonce déjà « navigation ». Pour le desktop, « Navigation principale » donne « Navigation principale, navigation » ; si cette redondance gêne à l'écoute, retenir **« Principale »** (alternative B) et pour le mobile **« Menu mobile »** (alternative B). Ma recommandation reste A pour la lisibilité hors lecteur d'écran (tests, audits), mais B est plus propre à l'oreille. À trancher.
- Le bouton qui ouvre le menu mobile peut garder `nav.menu.ariaLabel` (« Menu ») ; si la fenêtre du menu est un `dialog`, lui donner « Menu de navigation » et laisser le `<nav>` interne sans second nom identique (éviter deux éléments imbriqués annoncés avec le même libellé).

## CTA du header

« Réserver mon échange Spark » (`nav.cta`) : **aucun `aria-label`**. Le texte visible est déjà explicite ; en ajouter un risquerait de diverger du libellé affiché (WCAG 2.5.3).

## Points à décider par Mel

1. Choix final entre les options A et B pour `method` (B recommandé) et les repères `<nav>` (A ou B, voir notes).
2. Faut-il préférer `aria-labelledby`/le texte visible seul pour `faq` ? Je recommande de garder « FAQ, questions fréquentes » : le sigle est mal lu par certains lecteurs d'écran.
3. Le menu mobile est-il un `dialog` ou un simple `<nav>` ? Cela conditionne l'annonce (voir notes), à confirmer avec `nextjs-dev`.

## Structure suggérée pour `locales/fr/hero.ts`

```ts
export const nav = {
  // …existant
  ariaLabel: "Navigation principale",
  itemsAriaLabel: {
    offers: "Comment je vous aide, services pour votre activité",
    method: "Du cadrage au suivi, ma méthode de travail",
    agent: "Demandez à {assistantName}, l'assistant virtuel IA",
    thisSite: "En coulisses, comment ce site a été construit",
    faq: "FAQ, questions fréquentes",
  },
  menu: {
    ariaLabel: "Menu de navigation",
  },
}
```
