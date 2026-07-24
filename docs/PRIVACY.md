# Politique de confidentialité — Dreamland Reborn QoL

*Dernière mise à jour : 25 juillet 2026. [English version below](#privacy-policy--dreamland-reborn-qol).*

## En résumé

**L'extension ne collecte aucune donnée.** Rien n'est envoyé, ni à nous, ni à un tiers.
Tout ce que l'extension enregistre reste dans votre navigateur, sur votre appareil.

## Ce que l'extension enregistre, et où

Uniquement dans le stockage local de votre navigateur (`browser.storage.local`), c'est-à-dire
sur votre machine :

| Donnée | Clé | Pourquoi |
|---|---|---|
| Les fonctionnalités activées ou désactivées | `settings` | Retenir vos choix dans la popup |
| Vos préréglages BBCode et leurs dossiers | `bbcodePresets` | Ce sont vos propres textes, écrits par vous dans la page d'options |
| Les passages que vous surlignez dans les sujets | `highlights` | Les réafficher après rechargement, sur le sujet comme dans la relecture |
| L'état du panneau latéral (ouvert / replié) | `bbcodePresetsUi` | Retrouver l'éditeur comme vous l'aviez laissé |

Ces données ne quittent jamais votre navigateur. Nous n'y avons pas accès. La synchronisation
entre appareils n'est pas utilisée (`storage.local`, pas `storage.sync`).

## Accès au réseau

L'extension n'envoie aucune requête à un serveur qui nous appartiendrait — nous n'avons pas de
serveur. La seule requête réseau qu'elle émet est une vérification de disponibilité du forum,
juste avant l'envoi d'un message : une requête `HEAD` vers **dreamland-reborn.net** (le forum
que vous étiez déjà en train de consulter), qui sert uniquement à savoir si le serveur répond,
afin de ne pas perdre votre message s'il est en panne. Elle ne transmet aucun contenu : ni
votre message, ni vos préréglages, ni votre identité.

## Ce que l'extension ne fait pas

- Aucune analyse d'audience, aucun traçage, aucune télémétrie, aucun cookie publicitaire.
- Aucune lecture ni transmission du contenu de vos messages, de vos identifiants de connexion,
  de votre historique de navigation ou de vos données personnelles.
- Aucune vente ni partage de données avec des tiers — il n'y a aucune donnée à partager.
- Aucun code téléchargé et exécuté à distance : tout le code est inclus dans le paquet publié
  et vérifiable dans le dépôt public.

## Où l'extension s'exécute

Uniquement sur les pages de **dreamland-reborn.net**. C'est la seule autorisation de site
demandée (`*://*.dreamland-reborn.net/*`) ; l'extension ne s'exécute sur aucun autre site et
n'y a aucun accès.

## Supprimer vos données

Désinstaller l'extension supprime tout ce qu'elle a enregistré. Vous pouvez aussi supprimer vos
préréglages un par un depuis la page d'options.

## Modifications

Si cette politique change, la nouvelle version sera publiée ici, dans le dépôt public, avec sa
date de mise à jour ; les modifications sont visibles dans l'historique Git.

## Contact

Par le dépôt du projet :
<https://github.com/Nokorbis/browser-extension-dreamland-helper/issues>

---

# Privacy Policy — Dreamland Reborn QoL

*Last updated: 25 July 2026. English translation of the French text above, which is the version
shown to users.*

## Summary

**The extension collects no data.** Nothing is transmitted to us or to any third party.
Everything it stores stays in your browser, on your device.

## What is stored, and where

Only in your browser's local storage (`browser.storage.local`), on your own machine:

| Data | Key | Why |
|---|---|---|
| Which features are enabled | `settings` | Remember the toggles you set in the popup |
| Your BBCode presets and their folders | `bbcodePresets` | They are your own text, authored by you in the options page |
| The passages you highlight in threads | `highlights` | Show them again after a reload, on the thread and in the topic review |
| Side panel state (open / collapsed) | `bbcodePresetsUi` | Restore the editor as you left it |

This data never leaves your browser. We have no access to it. Cross-device sync is not used
(`storage.local`, not `storage.sync`).

## Network access

The extension contacts no server of ours — we operate none. Its only network request is a
reachability check performed just before a post is submitted: a `HEAD` request to
**dreamland-reborn.net** (the forum you are already browsing), used solely to determine whether
the server is responding, so that your message is not lost if the forum is down. It carries no
content: not your message, not your presets, not your identity.

## What the extension does not do

- No analytics, tracking, telemetry, or advertising cookies.
- No reading or transmission of your post content, credentials, browsing history, or personal
  information.
- No selling or sharing of data with third parties — there is no data to share.
- No remotely hosted code: everything shipped is in the published package and auditable in the
  public repository.

## Where it runs

Only on **dreamland-reborn.net** pages. That is the sole host permission requested
(`*://*.dreamland-reborn.net/*`); the extension does not run on, and has no access to, any
other site.

## Deleting your data

Uninstalling the extension removes everything it stored. Presets can also be deleted
individually from the options page.

## Changes

If this policy changes, the updated version is published here in the public repository with its
revision date; changes are visible in the Git history.

## Contact

Through the project repository:
<https://github.com/Nokorbis/browser-extension-dreamland-helper/issues>
