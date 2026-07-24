# Chrome Web Store — fiche produit (copier-coller)

Every field of the Chrome Web Store listing, written out so submission is mechanical.
Developer-facing notes are in English (that's who reads them); everything meant for the
**listing itself** is in French, because the audience is a French forum.

Companion doc: [`../docs/PUBLISHING.md`](../docs/PUBLISHING.md) — the *process*.
This file is the *content*.

Keep this file in sync when the extension changes: it is the source the dashboard is filled
from, and the "single purpose" answer has to keep matching what the extension actually does.

---

## Store listing tab

### Nom (name)

```
Dreamland Reborn QoL
```

Comes from `extName` in `src/locales/fr.yml` via `__MSG_extName__`; the store reads it from the
uploaded package's `_locales/fr/messages.json`. **Don't retype it here** — if it ever needs to
change, change the YAML and ship a version.

### Description courte / summary

```
Améliorations de Qualité de Vie sur DR
```

Also from the package (`extDescription`), 38 characters — the limit is 132.

### Description détaillée

Paste as-is:

```
Dreamland Reborn QoL rassemble des aides à la rédaction pour le forum de jeu de rôle
dreamland-reborn.net. Écrire un message long ne devrait pas être risqué ni répétitif :
l'extension protège votre texte, accélère la mise en forme, et ne fait rien d'autre.

Elle ne fonctionne que sur dreamland-reborn.net, et tout ce qu'elle enregistre reste dans
votre navigateur.

━━━ PROTECTION PERTE DE MESSAGE ━━━

Deux façons classiques de perdre un message écrit : quitter la page sans avoir envoyé, ou
appuyer sur « Envoyer » au moment où le forum ne répond plus.

• Tant que l'éditeur contient du texte non envoyé, le navigateur demande confirmation avant
  de quitter la page (retour arrière, fermeture d'onglet, lien suivi). Un éditeur vide ou
  intact ne déclenche jamais l'avertissement.
• Avant chaque envoi réel, l'extension vérifie que le forum répond. S'il est indisponible,
  l'envoi est retenu et une fenêtre vous explique que votre message n'est pas parti et que
  votre texte est toujours là — libre à vous d'attendre ou d'envoyer quand même.
  L'aperçu et le brouillon ne sont pas concernés.

━━━ PRÉRÉGLAGES BBCODE ━━━

Enregistrez vos structures BBCode compliquées une fois, insérez-les en un clic.

• Des dossiers imbriqués autant que nécessaire — un par personnage, par exemple.
• Deux façons d'insérer : un bouton ajouté à la barre d'outils BBCode du forum, et un
  panneau qui se déplie à côté de l'éditeur.
• Deux marqueurs facultatifs dans un préréglage : le texte sélectionné y est réinjecté
  (avec au choix majuscules, minuscules, capitales ou espaces retirés), et la position du
  curseur après insertion est choisie par vous.
• Un seul Ctrl+Z annule toute l'insertion : elle passe par l'historique natif du navigateur.

Les préréglages se créent dans la page d'options de l'extension, avec un aperçu en direct.

━━━ RACCOURCIS CLAVIER ━━━

Les mêmes raccourcis sur Chrome, Brave et Firefox, actifs uniquement dans la zone de
rédaction : Ctrl+B gras, Ctrl+I italique, Ctrl+U souligné, Ctrl+K lien, Ctrl+E code, puis
Alt+Q citation, Alt+L liste, Alt+G couleur, Alt+N centrer, Alt+K spoiler… Les raccourcis
actionnent les boutons du forum lui-même, donc ils suivent exactement le comportement de
l'éditeur et couvrent aussi les BBCodes propres au forum. Chaque bouton affiche son raccourci
dans son infobulle.

━━━ PIPETTE À COULEUR ━━━

Réutilisez une couleur déjà employée dans le sujet sans fouiller le BBCode. Dans la palette de
couleurs du forum, une case « Sur la page » ne conserve que les couleurs présentes dans la
relecture du sujet, et ajoute à la fin celles qui manquent à la palette. L'infobulle de chaque
couleur indique qui l'a utilisée, et combien de fois.

━━━ VIE PRIVÉE ━━━

Aucune donnée collectée, aucun traçage, aucune publicité, aucun serveur tiers. Vos réglages
et vos préréglages sont enregistrés localement dans votre navigateur et n'en sortent pas.
La seule requête réseau émise est la vérification de disponibilité décrite plus haut, vers
le forum lui-même.

Politique de confidentialité :
https://github.com/Nokorbis/browser-extension-dreamland-helper/blob/main/docs/PRIVACY.md

━━━ REMARQUES ━━━

• Chaque fonctionnalité s'active ou se désactive indépendamment depuis l'icône de
  l'extension. Un changement s'applique au rechargement suivant de la page du forum.
• Extension libre (licence MIT), code source public :
  https://github.com/Nokorbis/browser-extension-dreamland-helper
```

> One feature listed in the repo README (*surligner le texte*) is **deliberately absent**
> above: it is an unimplemented stub, shipped disabled. Advertising it would be a
> listing-accuracy violation. Add it here when it ships.

### Catégorie

**Outils** / *Productivity → Workflow & Planning*. (Second-guessing the sub-category is not
worth it; it affects nothing for an unlisted item.)

### Langue

**Français**. The package's `default_locale` is `fr`, so this must match or the name and
summary render oddly in the dashboard preview.

### Ressources graphiques (all under `store/`)

| Champ | Fichier | Notes |
|---|---|---|
| Icône (128×128) | `store/icon-128-cws.png` | 96×96 artwork + 16 px transparent padding, per Google's spec. **Not** `icon-128.png` — that one is full-bleed, for AMO. |
| Captures d'écran | `store/screenshots/*.png` | 1280×800, 3–5 of them. See `store/screenshots/README.md`. |
| Petite image promo | `store/promo-440x280.png` | 440×280. Not optional in practice: items without one are ranked last. |
| Grande image promo (marquee) | — | 1400×560, optional, skipped. |

### URLs

- **Site web / page d'accueil** : `https://github.com/Nokorbis/browser-extension-dreamland-helper`
- **Assistance** : `https://github.com/Nokorbis/browser-extension-dreamland-helper/issues`
- **Politique de confidentialité** : `https://github.com/Nokorbis/browser-extension-dreamland-helper/blob/main/docs/PRIVACY.md`

The privacy URL must stay reachable and stable — renaming the repo breaks it, and a broken
privacy URL is grounds for removal.

---

## Privacy practices tab

This is the tab that gets extensions rejected. Answers below are the true ones and match
`docs/PRIVACY.md`, the AMO `data_collection_permissions: { required: ['none'] }` declaration in
`wxt.config.ts`, and the code.

### Single purpose (one field, English)

```
Dreamland Reborn QoL is a writing aid for composing forum posts on the single site
dreamland-reborn.net (a phpBB roleplay forum). Its one purpose is to help a member write a
post there without losing it and without retyping the same markup: it warns before leaving a
composer that still holds unsent text and checks the forum is responding before a post is
submitted, it inserts user-authored BBCode snippets at the cursor, it filters the forum's own
colour palette down to the colours already used in the thread so one can be reused in the post,
and it binds keyboard shortcuts to the forum's own BBCode toolbar buttons. All of these act on
the same object --
the post being written in the forum's composer -- and the extension does nothing on any other
page: its host permission is limited to *://*.dreamland-reborn.net/*.
```

> Why this wording: the extension ships several features, and "single purpose" is judged on
> the *purpose*, not the feature count. Every clause ties back to the one object (the post
> being written). Since the August 2026 policy update, data collection also has to be strictly
> necessary to this stated purpose — which is trivially satisfied here, as nothing is
> collected.

### Permission justifications (English)

**`storage`**

```
Stores the user's own settings and content locally: which of the extension's features are
enabled, the BBCode presets the user authors in the options page, and whether the preset panel
was left open or collapsed. This is the only way to keep a user's presets between page loads.
Nothing is written anywhere else, and nothing is transmitted -- storage.local only, never
storage.sync.
```

**Host permission `*://*.dreamland-reborn.net/*`**

```
The extension is written for this one forum. The content script must run on its pages to read
the composer textarea, insert text at the cursor, add a button to the forum's BBCode toolbar,
and detect submit events. The same origin is also the target of a HEAD request used to check
the forum is reachable before a post is sent, so a post is not lost to an outage. No other
host is requested and the extension has no access to any other site.
```

**Remote code**: *No, I am not using remote code.* — everything is bundled by WXT/Vite into the
package; MV3 forbids remote code and nothing here loads any.

### Data usage — what to declare

Tick **nothing** in the data-type list. Concretely, all of these are **No**:
personally identifiable information, health information, financial information,
authentication information, personal communications, location, web history,
user activity, website content.

> The presets a user writes are their own content, held on their own device and never sent
> anywhere. "Collection" in Google's sense means transmission off the device, which does not
> happen. `docs/PRIVACY.md` says exactly this, in case a reviewer asks.

Then tick all three certifications, which are true:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## Distribution tab

- **Visibility**: **Unlisted** — installable by link, not searchable. Per
  [ADR 0010](../docs/adr/0010-distribution-and-release-automation.md) and
  [ADR 0018](../docs/adr/0018-chrome-web-store-distribution.md); the audience is one forum's
  members, who get the link from the forum.
- **Distribution**: all regions. (France is what matters, but restricting regions buys
  nothing and members travel.)
- **Pricing**: free. Do **not** add any payment or in-app purchase — that would flip the
  account into needing a physical address, and into Trader status.

---

## Account-level, done once

- **Trader / Non-Trader**: **Non-Trader**. No monetisation, no paid features, no commercial
  activity. Leaving this undeclared gets the item blocked in the EU — i.e. for the entire
  audience of this extension.
- Contact email verified (the store shows it on the listing).
