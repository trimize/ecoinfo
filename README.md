# EcoInfo : résumés d'actualité fiables à partir des publications AMF

Petite application full stack qui :

1. récupère les publications réglementées des derniers jours depuis l'open data info-financière (AMF) ;
2. les stocke et les affiche dans une liste filtrable (société, type, sous-type, dates) ;
3. sélectionne automatiquement celles qui méritent un article, avec un score explicable ;
4. génère avec un LLM un résumé de 100 à 150 mots (titre, faits clés, chiffres, lien source) ;
5. vérifie que chaque chiffre du résumé figure dans le PDF source, et signale ceux qui n'y sont pas.

> **Vocabulaire** : l'énoncé parle de « brève », terme de presse pour une courte dépêche factuelle sur un seul fait. Dans l'application et ce README, on parle de **résumé** : un texte de 100 à 150 mots sur une seule publication AMF. À ne pas confondre avec une **synthèse**, qui couvre tous les événements importants d'un jour, d'un mois ou d'une année.

Les 5 fonctionnalités demandées sont toutes livrées. Les ajouts au-delà de l'énoncé sont listés dans [Fonctionnalités ajoutées hors énoncé](#fonctionnalités-ajoutées-hors-énoncé).

- **Application déployée** : https://boomingecoinfo.vercel.app
- **Repo** : https://github.com/trimize/ecoinfo

## Lancer en local

```bash
npm install
cp .env.example .env.local   # renseigner GEMINI_API_KEY (gratuite : https://aistudio.google.com/apikey)
npm run dev                  # http://localhost:3000, puis « Synchroniser » et « Générer les résumés »
npm run ingest -- 5          # (alternative CLI) ingestion des 5 derniers jours
npm run backfill -- 2026-01-01   # historique pour les synthèses mensuelles / annuelles
npm run report -- month 2026-10  # synthèse d'une période (day AAAA-MM-JJ | month AAAA-MM | year AAAA)
npm run generate             # résumés des publications retenues
npm run cron-plan -- 2026-12-01T00:05:00Z   # simulation du job de nuit (sans appel LLM)
npm test                     # tests du contrôle des chiffres
npm run check-figures -- <url_pdf> "texte à vérifier"   # outil de debug du contrôle
```

Sans variables Supabase, les données sont stockées dans `.data/db.json`, ce qui permet de lancer le projet sans configuration. En production : créer un projet Supabase, exécuter `supabase/schema.sql`, puis renseigner `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.

## Choix techniques

| Besoin | Choix | Pourquoi |
|---|---|---|
| Front + API | **Next.js 15 (App Router) + React 19 + Tailwind** | Un seul déploiement Vercel. Les pages sont des Server Components qui lisent la base directement ; routes API (`/api/ingest`, `/api/resumes`, `/api/reports`, `/api/cron`). |
| Stockage | **Supabase (Postgres)**, avec un fallback fichier JSON | Upsert idempotent sur l'identifiant AMF, filtres indexés. Le fallback local évite toute configuration pour essayer le projet. |
| Extraction PDF | **unpdf** (pdf.js) | Fonctionne en serverless, sans binaire natif. |
| LLM | **Google Gemini 3.8 Flash** (`@google/genai`), offre gratuite | Choisi **uniquement pour le coût** : gratuit pour un exercice. La sortie JSON est contrainte par un schéma généré depuis Zod, puis revalidée par Zod. Les erreurs 429/503 de l'offre gratuite sont relancées, puis le client bascule sur un autre modèle Gemini quand le quota du jour est épuisé. Tout passe par une seule interface (`src/lib/llm.ts`) : changer de modèle ou de fournisseur ne touche ni aux prompts ni à la vérification. |
| Vérification | **Code déterministe** (regex + normalisation numérique), sans LLM | On ne demande pas au modèle de noter son propre travail. |
| Planification | Cron Vercel chaque nuit à 00:05 UTC sur `/api/cron` (protégé par `CRON_SECRET`) | Synchronise, puis rédige les synthèses arrivées à échéance : voir [Génération automatique des synthèses](#génération-automatique-des-synthèses). |
| Accès | Code partagé (`ACCESS_PASSWORD`), cookie httpOnly contenant un HMAC du code | Assez pour un exercice : protège les quotas sans gérer de comptes. Vérifié côté serveur dans chaque route API, pas seulement masqué dans l'interface. |
| Thème | Palettes Tailwind v4 inversées en mode sombre (`globals.css`) | Les couleurs Tailwind sont des variables CSS : inverser les nuances (50↔950…) sous `.dark` adapte toute l'interface sans ajouter une seule classe `dark:`. |

**Gemini pour le coût, Claude pour le produit.** Gemini a été retenu parce que son offre gratuite permet de faire tourner l'exercice sans dépenser un centime. Pour un vrai produit, je choisirais **Claude** (Anthropic), pour plusieurs raisons :

- la qualité rédactionnelle en français et le respect des consignes (ne pas calculer, ne pas arrondir, citer ses sources) ;
- l'API de **citations**, qui rattache chaque phrase à un passage précis du PDF et rendrait la vérification sémantique beaucoup plus simple ;
- la stabilité d'un service payant : pas de quota de 20 requêtes par jour, pas de modèle retiré aux nouveaux utilisateurs du jour au lendemain, ce qui nous est arrivé avec `gemini-2.5-flash`.

La migration se limite au fichier `src/lib/llm.ts`.

La génération se fait **une publication par requête HTTP** : le bouton enchaîne les appels côté client. Chaque appel reste ainsi sous la limite de durée d'une fonction serverless, et un échec n'empêche pas les autres résumés.

```
src/lib/amf.ts       client API Opendatasoft + normalisation des enregistrements
src/lib/scoring.ts   score éditorial, détection des doublons FR/EN, sélection
src/lib/pdf.ts       téléchargement et extraction de texte
src/lib/llm.ts       appel LLM (Gemini), sortie structurée, bascule entre modèles
src/lib/summary.ts   prompt + assemblage du résumé et de son statut
src/lib/numbers.ts   extraction et vérification des chiffres
src/lib/store.ts     Supabase / fichier JSON
src/lib/reports.ts   synthèses jour / mois / année : candidats, prompt, contrôle des sources et des chiffres
src/lib/auth.ts      plan « Pro » (code d'accès partagé)
src/app/             pages (synthèses, publications, fiche, résumés, méthode, abonnement) et routes API
```

## Comprendre la structure des données

La fiche data.gouv.fr (« API Info-Financière ») renvoie vers une instance **Opendatasoft** : `https://www.info-financiere.gouv.fr/api/explore/v2.1`. J'ai d'abord listé les jeux du catalogue (`/catalog/datasets`) :

- `flux-amf-new-prod` (~540 000 enregistrements) : **le flux des dépôts**, un enregistrement par document ;
- des référentiels : `types-dinformation` (55 codes LOV), `sous-type-dinformation`, `societes-cac40`, `codes-lei`, `liste-code-isi`.

J'ai ensuite lu le schéma (`/datasets/flux-amf-new-prod`) et utilisé les agrégations ODSQL (`group_by`, `count(*)`) pour mesurer la réalité des données sur 5 jours (356 publications) :

| Champ | Rôle | Imperfections constatées |
|---|---|---|
| `uin_idt_uin` | identifiant unique (`652916_20261102`) | `count(distinct)` renvoie 358 pour 356 lignes (comptage approximatif côté ODS). Je dédoublonne quand même à l'ingestion. |
| `uin_dat_amf` | date de réception AMF, utilisée pour la période | `uin_dat_mar` (date marché) vaut parfois `8887-12-31`, une valeur sentinelle. Je l'ignore. |
| `identificationsociete_iso_nom_soc` | société | casse et espaces irréguliers |
| `identificationsociete_iso_cd_isi` | ISIN | placeholder `999999999999` pour les émetteurs non cotés en actions (ex. Arval), converti en `null` |
| `informationdeposee_inf_tit_inf` | titre | parfois générique (« Informations privilégiées / Autres communiqués ») ou en MAJUSCULES, avec des doubles espaces |
| `informationdeposee_inf_stp_inf` | code(s) de type LOV | soit `"005002"`, soit une **liste sérialisée en chaîne** `'["005002", "001007"]'` |
| `type_d_information` / `sous_type_d_information` | libellés dérivés des codes | `null` pour certains codes (ex. `004001`), et un même libellé peut couvrir plusieurs codes (`001002`, `001006`, `001007`… sont tous des « Informations privilégiées ») |
| `informationdeposee_inf_lng_inf` | langue | **beaucoup de doublons FR/EN** : 126 versions anglaises d'un communiqué français sur 356 |
| `informationdeposee_inf_lst_dif` | canaux de diffusion | de `["AMF"]` seul (simple dépôt) à 20+ agences (vrai communiqué de presse) |
| `cac40` | `"1"` / `"0"` / `null` | `null` pour plus de la moitié des lignes |
| `url_de_recuperation` | lien direct vers le PDF | PDF textuels en général. Les PDF scannés sont gérés. |

J'ai donc filtré les libellés plutôt que les codes : les libellés sont stables, alors que les codes sont multiples et parfois combinés.

## Critère de sélection

Le critère est un score additif. Chaque contribution est affichée sur la fiche de la publication et dans l'infobulle du score dans la liste (voir `src/lib/scoring.ts` et la page `/methode`).

1. **Catégorie réglementaire** (le signal le plus fort, puisque c'est l'émetteur qui qualifie son document) :
   offre publique +45, **information privilégiée (MAR art. 17)** +40, information trimestrielle +30, rapport annuel +20, semestriel +15, franchissement de seuil +15 ;
   rachat d'actions −15, déclaration de droits de vote −25, avis de mise à disposition / honoraires / contrat de liquidité −25.
2. **Audience** : société du CAC 40, +25.
3. **Communiqué de presse vs simple dépôt** : diffusé à 5 canaux ou plus (AFP, Reuters, Bloomberg…), +10.
4. **Signaux du titre** (cumulables) : résultats / chiffre d'affaires +15, révision de perspectives +15, M&A ou offre +15, dépréciation / difficultés +10, opération sur capital ou financement +8, perspectives +5, contrat / nomination +5 ; libellés administratifs −20.
5. **Sans PDF**, −100 : on ne publie pas ce qu'on ne peut pas vérifier.

Ensuite :

- les **doublons FR/EN** (même société, même sous-type, même jour, langue opposée, à moins de 6 h d'écart) sont fusionnés et la version française est gardée ;
- au plus **une publication par société** est retenue ;
- on garde les **5 meilleurs scores ≥ 50**.

Résultat sur la semaine du 28/10 au 02/11/2026 : Alstom (perspectives ajustées, 120), Sanofi (T3 et perspectives relevées, 110), Schneider Electric (émission obligataire de 6 Md€ pour PTC, 98), Renault (CA T3, objectifs confirmés, 95), Crédit Agricole SA (résultats T3, 90). Les déclarations de rachat d'actions et les avis de mise à disposition tombent en bas du classement.

C'est volontairement une heuristique **lisible et ajustable par un rédacteur en chef**, plutôt qu'un classifieur opaque. Ses limites sont décrites dans les pistes d'amélioration.

## Contrôle de l'exactitude des chiffres

Le principe est que **le LLM rédige, du code vérifie.**

1. **En amont, par le prompt** : le modèle ne reçoit que le texte du PDF. Il a pour consigne de recopier chaque chiffre tel quel, sans calcul, arrondi ni conversion, et en notation française. Cette consigne réduit les erreurs mais ne garantit rien.
2. **En aval, par un contrôle déterministe** (`src/lib/numbers.ts`) :
   - tous les nombres du titre, du corps et des faits clés sont extraits, ainsi que leur unité (%, milliers, millions, milliards, en FR et en EN) ;
   - le texte du PDF est normalisé : espaces insécables, espaces fines et signes moins typographiques. Chaque nombre y est lu dans les deux notations, et un jeton ambigu (`1,234`) donne deux candidats ;
   - chaque chiffre du résumé reçoit l'un des statuts suivants :
     - **trouvé** : même valeur et même unité ; ou conversion exacte (`1 milliard` = `€1 000 millions`) ; ou cellule de tableau sans unité **écrite avec la même précision** ;
     - **arrondi** : le document contient une valeur plus précise qui s'arrondit au chiffre écrit (`4,08 %` ← `4,084 %`, `1,3 Md$` ← `$1,297 million`) ;
     - **introuvable** : le chiffre est surligné en rouge, et le résumé passe en « à relire ».
   - le résumé est aussi marqué « à relire » s'il sort de la plage 100–150 mots ou si le document a été tronqué ;
   - un PDF sans texte extractible (scanné) n'est pas envoyé au LLM : statut « non vérifiable ».
3. **Dans l'interface** : chaque chiffre est coloré (vert, bleu ou rouge). Un tableau dépliable affiche, pour chaque chiffre, **l'extrait exact du document** où il a été trouvé, ce qui permet au rédacteur de valider en un coup d'œil.

**Limites assumées** :

- la présence d'un nombre ne prouve pas qu'il est attribué à la bonne métrique ni à la bonne période (un « 5 % » peut exister ailleurs dans le document) ;
- le signe n'est pas contrôlé (hausse ou baisse) ;
- les nombres écrits en lettres ne sont pas contrôlés.

Les règles de correspondance sont donc conservatrices : pas de facteur d'échelle deviné, précision identique exigée pour les cellules sans unité. Cela produit plus de fausses alertes, et c'est voulu : un faux « vérifié » est plus grave qu'un faux « à relire ». Les cas sont couverts par `tests/numbers.test.ts`.

## Synthèses du jour, du mois et de l'année

C'est la page d'accueil, car c'est ce qu'un utilisateur veut voir en premier : **« que s'est-il passé d'important ? »**. Les onglets Jour / Mois / Année, les flèches et le sélecteur de date permettent de naviguer, et la synthèse la plus récente s'affiche par défaut.

Les synthèses sont construites pour être **adossées à des documents**, à trois niveaux :

1. **Liste fermée de sources** : le LLM ne reçoit que les publications les plus marquantes de la période. Elles sont choisies par le même score que les résumés, sans doublons FR/EN, avec 2 à 4 publications par société au maximum (25 pour un jour, 50 pour un mois, 80 pour une année). Pour chacune, il reçoit son titre et, s'il existe, son résumé déjà vérifié. Chaque publication porte un identifiant.
2. **Citations obligatoires et contrôlées** : chaque événement doit citer les identifiants de ses sources. Le code écarte tout événement qui ne cite aucune source connue, et ne garde que les identifiants qui existent : un lien inventé est impossible. À l'écran, chaque événement liste ses sources, avec un lien vers la fiche, le PDF AMF et le badge « résumé vérifié » quand il y en a un.
3. **Chiffres vérifiés source par source** : le vérificateur des résumés est réutilisé, mais il compare chaque événement **uniquement au texte des sources qu'il cite**. Un chiffre vrai ailleurs mais attribué au mauvais événement est donc signalé. La vue d'ensemble ne doit contenir aucun chiffre.

Pour aider à la décision, chaque événement a un « pourquoi c'est important » et une tonalité pour la société concernée (positif, négatif, neutre, mixte). Le prompt interdit toute recommandation d'achat ou de vente et toute prévision de cours. La colonne de droite montre le **classement automatique sans IA** des mêmes sources : il reste disponible quand aucune synthèse n'a encore été rédigée.

Synthèses déjà générées en production : jour (30/10 et 02/11/2026), mois (octobre et novembre 2026) et année 2026 (8 événements adossés à 28 publications, de l'acquisition de SFR par Bouygues à l'avertissement d'Alstom). Exemple, octobre 2026 (Gemini 3.5 Flash) : 6 événements fondés sur 50 publications parmi 1 971. Les 44 chiffres ont été retrouvés dans les sources citées. Les publications liées ont été regroupées correctement : augmentation de capital et émission obligataire de Schneider pour PTC (3 dépôts), résultats de Crédit Agricole et acquisition d'IKB (3 dépôts).

### Génération automatique des synthèses

Un job de nuit (`/api/cron`, planifié dans `vercel.json`) tourne juste après minuit UTC :

1. il synchronise les 5 derniers jours de dépôts, pour que la journée écoulée soit complète ;
2. il demande à `planReports` (`src/lib/schedule.ts`, fonction pure, testée) les synthèses à rédiger :
   - **chaque nuit**, la synthèse du **jour qui vient de se terminer** ;
   - **le dernier jour du mois**, en plus, la synthèse **définitive du mois** ;
   - **le 31 décembre**, en plus, la synthèse **définitive de l'année** ;
   - en **rattrapage**, les 7 derniers jours, le dernier mois et la dernière année terminés, dont la synthèse manque ou n'est que provisoire.

Une synthèse est **définitive** si elle a été rédigée après la fin de sa période. Sinon, elle est marquée « Provisoire » dans l'interface et sera remplacée à la clôture. Une nuit ratée (quota, panne) est donc réparée la nuit suivante, et relancer le job ne régénère rien d'inutile.

Les périodes sans publication marquante (week-ends, jours fériés) sont ignorées sans appel au LLM. Le job est plafonné à 4 rédactions par nuit et coupé avant la limite de durée d'exécution, pour rester dans le quota gratuit. Les cas fin de journée, de mois et d'année, la régénération d'une synthèse provisoire, l'idempotence, le rattrapage et le plafond sont couverts par `tests/schedule.test.ts`. `npm run cron-plan -- <date>` simule une nuit sur les vraies données, sans appeler le LLM.

Données : l'historique 2026 (20 959 publications) a été chargé avec `npm run backfill`. Il passe par le point d'accès `/exports` d'Opendatasoft, qui renvoie une période entière en une requête, alors que la pagination de `/records` est plafonnée à 10 000 lignes.

## 3 prompts clés

**1. Prompt système de rédaction** (`src/lib/summary.ts`) :

```
Tu es journaliste financier. Tu rédiges des résumés d'actualité boursière à partir d'un communiqué réglementé déposé auprès de l'AMF.

Règles impératives :
- Uniquement des informations présentes dans le document fourni. Aucune connaissance extérieure, aucun cours de bourse, aucune comparaison non citée dans le document.
- Chaque chiffre doit être recopié tel qu'il apparaît dans le document (même valeur, même unité, même période). Ne calcule rien, n'arrondis pas, ne convertis pas les unités ni les devises.
- Écris les nombres en notation française : espace pour les milliers, virgule pour les décimales (ex. 1 234,5 M€ ; 3,2 %).
- Les montants négatifs notés entre parenthèses dans les tableaux comptables, comme « (4) % » ou « (1 248) M€ », s'écrivent en toutes lettres pour le lecteur : « une marge négative d'environ 4 % », « un cash-flow libre négatif de 1 248 millions d'euros ». N'utilise jamais de parenthèses autour d'un chiffre.
- Mentionne la période concernée (ex. troisième trimestre 2026) quand le document la précise.
- Si le document est en anglais, rédige en français mais garde les chiffres identiques.
- Ton neutre et factuel : pas d'adjectifs promotionnels repris du communiqué sans les attribuer à la société (« selon le groupe »).
- Corps de texte : 100 à 150 mots, un ou deux paragraphes, sans titre ni liste.
```

La notation française imposée n'est pas qu'un choix de style : elle rend le parsing des chiffres du résumé **non ambigu** pour le vérificateur.

**2. Prompt utilisateur** : métadonnées AMF et texte du document entre balises, avec une sortie contrainte par un schéma Zod (`title`, `body`, `key_facts`) :

```
<metadata>Société / Titre du dépôt / Catégorie AMF / Date</metadata>
<document>…texte extrait du PDF…</document>
Rédige le résumé (titre, corps de 100 à 150 mots, 3 à 5 faits clés chiffrés quand c'est possible).
```

**3. Prompt système des synthèses** (`src/lib/reports.ts`, extrait) :

```
Tu n'utilises QUE les publications fournies. Aucune connaissance extérieure, aucun cours de bourse, aucun événement absent de la liste.
Chaque événement cite dans source_ids les identifiants exacts (attribut id) des publications qui le fondent. Un événement sans source n'existe pas.
Un chiffre ne peut apparaître que s'il figure dans le titre ou le résumé d'une publication citée par cet événement ; recopie-le sans calcul, arrondi ni conversion. Dans la vue d'ensemble, aucun chiffre, ni en chiffres ni en toutes lettres.
Regroupe les publications qui traitent du même sujet en un seul événement. Classe les événements du plus au moins important pour un investisseur ou un dirigeant.
why_it_matters explique l'enjeu de manière factuelle. Pas de recommandation d'achat ou de vente, pas de prévision de cours.
```

**Prompt de développement (Claude Code)** pour concevoir le vérificateur :

> « Écris une fonction déterministe qui vérifie que chaque nombre d'un texte français existe dans un texte source pouvant être en notation française ou anglaise, avec unités (%, M, Md, bn), arrondis et conversions d'unités. Un faux positif est plus grave qu'un faux négatif. Teste-la sur le PDF Schneider Electric avec un mélange de chiffres vrais, arrondis et inventés. »

## Erreurs de l'IA détectées

1. **Faux positifs du vérificateur** (le code généré par l'IA). La première version acceptait un nombre du résumé dès que la même valeur apparaissait **sans unité** dans le PDF. Sur le communiqué Schneider, « 6,0 milliards » était validé par le **« 6 » du numéro de téléphone** (`+33 6 79 11 49 71`), et « 1 milliard » par **« Page | 1 »**. Je l'ai repéré en testant volontairement des chiffres faux, puis corrigé : stratégies ordonnées (même unité, puis conversion exacte, puis cellule sans unité seulement avec une précision identique), avec des tests de non-régression.
2. **Regex de scoring sans frontière de mot**. Le motif « révision de perspectives » contenait `cut`, qui correspondait à « exé**cut**ion ». Tout titre mentionnant « difficultés d'exécution » gagnait +15 à tort. Corrigé avec un lookbehind Unicode `(?<!\p{L})`.
3. **Mauvaise attente dans un test écrit par l'IA**. Un test affirmait que « 6 milliards » devait être introuvable, alors que le document contient « 6,0 milliards » : c'est bien la même valeur. Ici c'est le code qui avait raison et le test qui avait tort, ce qui rappelle que les tests générés se relisent aussi.
4. **Erreur du LLM, provoquée par mon prompt** (Gemini 3.8 Flash, résumé Alstom). La consigne « recopie chaque chiffre tel qu'il apparaît » a été suivie à la lettre : le résumé écrivait « une marge d'exploitation ajustée d'environ **(4) %** » et « un cash-flow libre de **(1 248) millions d'euros** », en reprenant la notation comptable des négatifs entre parenthèses. Le contrôle automatique l'a validée, puisque les chiffres sont bien dans le document, mais un lecteur grand public ne comprend pas cette notation. Corrigé par une règle explicite dans le prompt système. C'est aussi une limite du vérificateur : il ignore le signe, et il ne pouvait donc rien signaler.
5. **Ce que le vérificateur ne voit pas, contrôlé à la main.** Sur les 3 premiers résumés (Alstom 16/16, Sanofi 13/13, Crédit Agricole 20/20 chiffres trouvés), j'ai vérifié l'*attribution* de chaque chiffre dans le PDF (`scripts/source-grep.ts`) : aucune erreur de métrique ni de période. Par exemple, pour Crédit Agricole, le modèle a bien distingué le +17,9 % publié du +11,0 % retraité, et les chiffres de Crédit Agricole S.A. de ceux du Groupe Crédit Agricole. Ce contrôle manuel est exactement ce que la « vérification sémantique » des pistes d'amélioration automatiserait.
6. **Le LLM contourne une règle plutôt que de la respecter** (synthèse du 30/10/2026). Le prompt interdisait les chiffres dans la vue d'ensemble. Le modèle a écrit « CAC 40 » dans le titre, et **« CAC quarante » en toutes lettres** dans la vue d'ensemble. Le vérificateur a signalé le « 40 » du titre : c'était une fausse alerte (un nom d'indice, pas un chiffre), mais elle a révélé le contournement. Deux corrections : les noms d'indices (CAC 40, SBF 120…) sont exclus du contrôle, avec un test dédié, et le prompt interdit désormais les nombres « ni en chiffres ni en toutes lettres ». Leçon : une règle de prompt se vérifie dans les sorties, elle ne se suppose pas respectée.

## Idées d'amélioration (avec plus de temps)

- **Vérification sémantique** : en plus du contrôle numérique, extraire des triplets (métrique, période, valeur) du résumé et du document, puis vérifier l'attribution, pas seulement la présence. Les *citations* de l'API Claude (passer le PDF en bloc `document` avec `citations: enabled`) donneraient en plus un passage source pour chaque phrase.
- **Passer à Claude** : remplacer Gemini par Claude dans `llm.ts`, puis mesurer l'écart sur un même jeu de publications annotées (taux de chiffres introuvables, respect des consignes, qualité rédactionnelle). Les citations de l'API Claude serviraient aussi de base à la vérification sémantique.
- **Sélection** : apprendre les poids du score à partir de ce que la rédaction publie réellement (feedback « publié / ignoré ») ; ajouter des signaux de marché (variation du cours, capitalisation) et de nouveauté (premier communiqué sur le sujet vs relance) ; regrouper les dépôts multiples d'un même événement (communiqué, présentation, rapport).
- **Fiabilité de l'ingestion** : ingestion incrémentale par curseur de date, gestion des mises à jour (`inf_upg_sts` ≠ `NEW`), OCR pour les PDF scannés, référentiel des émetteurs (ISIN / LEI) pour corriger les noms.
- **Workflow rédactionnel** : édition du résumé dans l'interface, avec revérification en direct à chaque modification ; statut publié / rejeté ; historique des versions ; alertes temps réel sur les informations privilégiées des valeurs suivies.
- **Évaluation** : constituer un jeu d'environ 50 publications annotées pour mesurer le taux de chiffres introuvables et la qualité éditoriale selon le prompt et le modèle.
- **Sécurité** : remplacer le code partagé par de vrais comptes (Supabase Auth), avec un quota par utilisateur et une limitation de débit sur `/api/auth`.
- **Synthèses** : comparer avec la période précédente (« ce qui a changé depuis le mois dernier »), filtrer par secteur ou par liste de valeurs suivies, et envoyer la synthèse du jour par e-mail chaque matin.
- **Quotas LLM** : l'offre gratuite de Gemini est limitée à environ 20 requêtes par jour et par modèle. Le client bascule déjà automatiquement sur le modèle suivant (3.8 Flash → 3.5 Flash → Flash Lite) quand le quota du jour est épuisé. En production, un modèle payant et une file d'attente s'imposent.

## Fonctionnalités ajoutées hors énoncé

| Fonctionnalité | Ce qu'elle apporte |
|---|---|
| **Synthèses du jour, du mois et de l'année** (page d'accueil) | Les événements importants de la période, classés pour un décideur, avec un « pourquoi c'est important » et une tonalité. Chaque événement est adossé aux documents AMF qu'il cite, et ses chiffres sont vérifiés contre ces seules sources. |
| **Génération automatique de nuit** | Synthèse du jour chaque nuit, du mois à sa clôture et de l'année au 31 décembre. Rattrapage des nuits ratées, badge « Provisoire » pour une période en cours. |
| **Historique 2026 complet** | 20 959 publications chargées par le point d'accès `/exports`, pour des synthèses mensuelles et annuelles réelles. |
| **Plan « Pro Recruteur »** | Code d'accès partagé, vérifié côté serveur, qui protège les actions consommant des quotas. Les visiteurs lisent tout librement. Page d'abonnement humoristique (« facturé en une seule fois : une offre d'emploi »). |
| **Thème clair / sombre** | Automatique selon le système, ou au choix ; une seule règle CSS grâce à l'inversion des palettes. |
| **Contrôle des chiffres visible** | Chaque chiffre est surligné en vert, bleu ou rouge dans les résumés et les synthèses, avec l'extrait exact du PDF où il a été trouvé. |
| **Classement sans IA** | Les publications les plus marquantes de chaque période restent consultables même sans synthèse rédigée. |
| **LLM résilient** | Bascule automatique vers un autre modèle Gemini quand le quota gratuit du jour est épuisé ou qu'un modèle n'est plus disponible ; fournisseur isolé dans un seul fichier. |
| **Doublons FR/EN fusionnés** | 126 versions anglaises sur 356 publications regroupées avec leur original français. |
| **Page « Méthode »** | Critère de sélection et méthode de vérification expliqués aux utilisateurs dans l'application. |
| **Tests et outils** | 14 tests (vérificateur de chiffres, planification). Scripts CLI : ingestion, historique, résumés, synthèses, simulation du job de nuit, recherche dans un PDF source. |
| **Sécurité** | Next.js et React mis à jour contre la CVE-2025-55182 (React2Shell). Fonctionnement « fermé par défaut » si le code d'accès manque en production. |

## Temps passé

Environ **2 heures**, avec Claude Code. Le temps a été réparti entre l'exploration de l'API et des données, l'application de base (fonctionnalités 1 à 5), le déploiement (Supabase, Vercel), puis les ajouts hors énoncé.
