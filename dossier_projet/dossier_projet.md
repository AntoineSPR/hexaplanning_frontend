<!-- vscode-markdown-toc -->

# Table des matières

**I. [Introduction](#i-introduction)**

1.  [Présentation du projet](#i-1-présentation-du-projet)
2.  [Objectifs et contexte](#i-2-objectifs-et-contexte)

**II. [Fonctionnalités principales](#ii-fonctionnalités-principales)**

1.  [Page d'accueil](#ii-1-page-d-accueil)
2.  [Gestion des quêtes (tâches)](#ii-2-gestion-des-quêtes-tâches)
3.  [Affichage visuel en hexagones (carte)](#ii-3-affichage-visuel-en-hexagones-map)
4.  [Système d'authentification et gestion des utilisateurs](#ii-4-système-d-authentification-et-gestion-des-utilisateurs)
5.  [Navigation et ergonomie](#ii-5-navigation-et-ergonomie)

**III. [Modélisation des données](#iii-modélisation-des-données)**

1.  [MCD (Modèle Conceptuel de Données)](#iii-1-mcd-modèle-conceptuel-de-données)
2.  [MLD (Modèle Logique de Données)](#iii-2-mld-modèle-logique-de-données)
3.  [Description des entités et relations](#iii-3-description-des-entités-et-relations)

**IV. [Architecture technique et technologies](#iv-architecture-technique-et-technologies)**

1.  [Vue d'ensemble](#iv-1-vue-d-ensemble)
    - [Schéma global](#iv-1-1-schéma-global)
2.  [Frontend : Angular et PrimeNG](#iv-2-frontend-angular-et-primeng)
3.  [Backend : .NET Core](#iv-3-backend-net-core)
4.  [Base de données : PostgreSQL](#iv-4-base-de-données-postgresql)
5.  [Communication API REST](#iv-5-communication-api-rest)
6.  [Infrastructure et DevOps](#iv-6-infrastructure-et-devops)
7.  [Services externes](#iv-7-services-externes)
8.  [Sécurité et bonnes pratiques](#iv-8-sécurité-et-bonnes-pratiques)

**V. [Qualité logicielle et tests](#v-qualité-logicielle-et-tests)**

1.  [Tests unitaires (backend)](#v-1-tests-unitaires-backend)
2.  [Tests d’intégration](#v-2-tests-d-intégration)
3.  [Tests de charge et fixtures](#v-3-tests-de-charge-et-fixtures)
4.  [Stratégie de validation](#v-4-stratégie-de-validation)

**VI. [Déploiement et intégration continue](#vi-déploiement-et-intégration-continue)**

1.  [Intégration continue (CI) de l’API](#vi-1-intégration-continue-ci-de-l-api)
2.  [Déploiement continu (CD) du backend](#vi-2-déploiement-continu-cd-du-backend)
3.  [Déploiement continu (CD) du frontend](#vi-3-déploiement-continu-cd-du-frontend)
4.  [Conteneurisation et orchestration](#vi-4-conteneurisation-et-orchestration)
5.  [Hébergement et reverse proxy](#vi-5-hébergement-et-reverse-proxy)

**VII. [Sécurité](#vii-sécurité)**

1.  [Authentification et gestion des accès](#vii-1-authentification-et-gestion-des-accès)
2.  [Validation et intégrité des données](#vii-2-validation-et-intégrité-des-données)
3.  [Protection contre les attaques](#vii-3-protection-contre-les-attaques)
4.  [Sécurité de la conteneurisation et du déploiement](#vii-4-sécurité-de-la-conteneurisation-et-du-déploiement)
5.  [Surveillance et audit](#vii-5-surveillance-et-audit)

**VIII. [Conclusion et perspectives](#viii-conclusion-et-perspectives)**

1.  [Bilan du projet](#viii-1-bilan-du-projet)
2.  [Perspectives d'évolution](#viii-2-perspectives-d-évolution)

---

---

# I. Introduction

## 1. <a name='Prsentationduprojet'></a>Présentation du projet

Hexaplanning est une application web de gestion de tâches, pensée pour transformer la to-do list classique en une expérience visuelle et ludique. Reprenant la nomenclature des jeux-vidéos, les tâches sont appelées "quêtes". Chacune d'entre elles peut être placée sur une carte d’hexagones, permettant à l’utilisateur de visualiser ses objectifs comme un parcours à accomplir.

Cette approche vise à rendre la planification plus motivante et interactive, en s’inspirant des mécaniques de jeu et de la gamification. Hexaplanning est destinée tout particulièrement aux personnes sujètes à un trouble de l'attention et ayant de la difficulté à se concentrer sur une tâche à la fois.

L'application a été développée en mobile-first, favorisant une utilisation quotidienne permettant à l'utilisateur d'avoir un aperçu de sa progression et de la mettre à jour régulièrement. Elle est bien entendu accessible également sur ordinateur, et l'utilisateur pourra se créer un compte pour accéder à sa progression depuis n'importe quel appareil.

## 2. <a name='Objectifsetcontexte'></a>Objectifs et contexte

Le projet est né du constat que la gestion des tâches peut rapidement devenir monotone et décourageante, surtout lorsqu’elle se limite à une simple liste. Hexaplanning propose une alternative visuelle et dynamique, où chaque utilisateur peut organiser ses quêtes selon ses priorités et ses envies, tout en bénéficiant d’un suivi clair de sa progression. L’application s’adresse à toute personne souhaitant mieux organiser son temps, que ce soit dans un cadre personnel, scolaire ou professionnel, et met l’accent sur l’ergonomie, la sécurité et la personnalisation de l’expérience.

# II. Fonctionnalités principales

## 1. <a name='PagedAccueil'></a>Page d'accueil

<div align="center">
<img src="images/dashboard.png" width="200" />
</div>

<div align="center">
<em>Page d'accueil d'Hexaplanning.</em>
</div>

La page d'accueil apparaît dès la connexion de l'utilisateur, et affiche le nombre de quêtes qu'il lui reste à accomplir

## 2. <a name='Gestiondesqutestches'></a>Gestion des quêtes (tâches)

Les tâches, appelées "quêtes", sont au cœur de l’application. Chaque quête possède un titre, un statut (en attente, en cours et terminée) et une priorité (primaire, secondaire ou tertiaire, avec une icône et un code couleur associés), ainsi qu’une description et un temps estimé en option, ainsi qu'un pourcentage de progression (associé à une barre de progression) dans le cas des quêtes en cours. L’utilisateur peut créer, éditer ou supprimer une quête, la marquer rapidement comme terminée ou la remettre en attente, et l'associer à un hexagone sur la carte prévue à cet effet.

<div align="center">
<img src="images/details-quete.png" width="200" />
</div>

<div align="center">
<em>Modale de détails d'une quête.</em>
</div>
<br />

<div align="center">
<img src="images/edition-quete.png" width="200" />
</div>

<div align="center">
<em>Edition d'une quête existante.</em>
</div>
<br />

<div align="center">
<img src="images/modale-suppression.png" width="200" />
</div>

<div align="center">
<em>Modale de suppression d'une quête.</em>
</div>

Un affichage standard des quêtes est proposé aux utilisateurs, sous forme de deux listes : l'une pour les quêtes à accomplir, l'autre pour les quêtes accomplies. La navigation se fait via un menu composé de deux onglets. Les quêtes à accomplir sont triées par ordre de priorité.

<div align="center">
<img src="images/liste-quetes-non-accomplies.png" width="200" />
</div>

<div align="center">
<em>Liste des quêtes non accomplies.</em>
</div>
<br />

<div align="center">
<img src="images/liste-quetes-accomplies.png" width="200" />
</div>

<div align="center">
<em>Listes des quêtes accomplies.</em>
</div>
<br />

<div align="center">
<img src="images/toast.png" width="200" />
</div>

<div align="center">
<em>Toast de succès : quête accomplie.</em>
</div>

Sur ces listes, l'utilisateur peut voir d'un coup d'oeil le titre de chaque quête ainsi qu'une icône représentant sa priorité, doublée d'un code couleur (orangé pour les principales, argenté pour les secondaires, gris foncé pour les tertiaires). Il dispose également d'un bouton à cocher pour aisément marquer une quête comme accomplie - ce qui déclenche un toast de succès - ou au contraire réhabiliter une quête terminée. Si la quête est indiquée comme "en cours", la barre de progression s'affiche directement sur l'aperçu de la quête, la remplissant progressivement d'une couleur plus sombre. Les quêtes terminées sont entièrement remplies.

## 3. <a name='Affichagevisuelenhexagonesmap'></a>Affichage visuel en hexagones (carte)

L’originalité d’Hexaplanning réside dans sa représentation visuelle : une carte d’hexagones sur laquelle l’utilisateur peut placer ses quêtes. Chaque hexagone peut accueillir une quête, et un code couleur sur le liseré permet d’identifier rapidement sa priorité (orangé pour les principales, argenté pour les secondaires, et aucun liseré pour les tertiaires). Les quêtes terminées apparaissent avec un fond plus sombre, et les quêtes en cours disposent d'une barre de progression radiale qui remplit progressivement l'hexagone avec cette couleur, à la manière d'une horloge.

<div align="center">
<img src="images/carte.png" width="200" />
</div>

<div align="center">
<em>Page de la carte d'hexagones.</em>
</div>

L'utilisateur peut assigner une quête en cliquant ou appuyant sur un hexagone vide, faisant apparaître une modale contenant la liste de toutes les quêtes non accomplies, et en sélectionnant la quête de son choix. Il pourra ensuite la désassigner d'un simple clic sur l'icône de croix au-dessus du titre de la quête, ce qui déclenchera une modale de confirmation.

<div align="center">
<img src="images/modale-assignation.png" width="200" />
</div>

<div align="center">
<em>Modale d'assignation d'une quête à un hexagone.</em>
</div>
<br />

<div align="center">
<img src="images/modale-desassignation.png" width="200" />
</div>

<div align="center">
<em>Modale de désassignation d'une quête à un hexagone.</em>
</div>

Tout comme sur les listes des quêtes, il suffit de cliquer ou d'appuyer sur un hexagone associé à une quête pour afficher les détails de la quête en question, et éventuellement modifier ou supprimer la quête (ce qui la fera disparaître de la carte et des listes).

## 4. <a name='Systmedauthentificationetgestiondesutilisateurs'></a>Système d'authentification et gestion des utilisateurs

L’accès à l’application nécessite la création d’un compte et une authentification sécurisée. L'utilisateur devra accepter les CGU et la politique de confidentialité, accessibles via des liens sur le formulaire de création de compte. Le mot de passe choisi devra respecter les normes standard : au minimum 8 caractères dont 1 lettre majuscule, 1 lettre minuscule, 1 chiffre et 1 caractère spécial. Après son enregistrement, l'utilisateur sera redirigé vers la page de connexion, et il peut aisément naviguer entre la connexion et la création de compte via un lien en bas de page.

<div align="center">
<img src="images/register.png" width="200" />
</div>

<div align="center">
<em>Page de création de compte.</em>
</div>
<br />

<div align="center">
<img src="images/login.png" width="200" />
</div>

<div align="center">
<em>Page de connexion.</em>
</div>

Un système de gestion des mots de passe oubliés est en place, avec envoi d'email pour la réinitialisation. Lorsque l'utilisateur clique sur "mot de passe oublié", une modale s'ouvre. Si l'utilisateur avait déjà rentré son adresse e-mail dans le champ de connexion, il sera automatiquement reporté dans le champ de la modale. Au clic sur le bouton d'envoi, un toast informe l'utilisateur qu'un mail a été délivré à l'adresse indiquée, si elle existe. En effet, il s'agit de ne pas confirmer ou infirmer la présence de cette adresse e-mail dans la base de données. De plus, il ne peut y avoir qu'une seule requête vers la même adresse toutes les 5 minutes, afin d'éviter le spam d'une adresse e-mail et la saturation du service de mail.

<div align="center">
<img src="images/modale-mdp-oublie.png" width="200" />
</div>

<div align="center">
<em>Modale de mot de passe oublié.</em>
</div>

Le destinataire recevera un mail contenant un lien de réinitialisation de mot de passe. Ce lien le redirigera vers la page prévue à cet effet, avec dans l'url un token valable une heure, et l'adresse e-mail du compte à modifier. Sans ces deux éléments valides, la requête ne pourra être acceptée. L'utilisateur n'a plus qu'à rentrer son nouveau mot de passe et à le confirmer, avant d'être redirigé vers la page de connexion.

<div align="center">
<img src="images/mail-reset-password.png" width="200" />
</div>

<div align="center">
<em>Mail de réinitialisation de mot de passe.</em>
</div>
<br />

<div align="center">
<img src="images/page-reset-password.png" width="200" />
</div>

<div align="center">
<em>Page de réinitialisation de mot de passe.</em>
</div>

L'utilisateur peut également changer son mot de passe depuis l'interface : en accédant au menu des paramètres, il aura la possibilité d'ouvrir une modale lui demandant son mot de passe actuel ainsi que le nouveau. Depuis ce même menu, il pourra se déconnecter de l'application.

<div align="center">
<img src="images/parametres.png" width="200" />
</div>

<div align="center">
<em>Page de paramètres.</em>
</div>
<br />

<div align="center">
<img src="images/modale-changement-mdp.png" width="200" />
</div>

<div align="center">
<em>Modale de changement de mot de passe.</em>
</div>
<br />

<div align="center">
<img src="images/modale-deconnexion.png" width="200" />
</div>

<div align="center">
<em>Modale de déconnexion.</em>
</div>

La sécurité des données et la protection contre les accès non autorisés sont assurées par des mécanismes robustes côté backend.

<!-- TODO : A développer (dans une autre section ?) -->

## 5. <a name='Navigationetergonomie'></a>Navigation et ergonomie

L’application propose un menu apparaissant en permanence en bas de page, et permettant de naviguer entre l’accueil, les listes de quêtes, la carte des hexagones et les paramètres. Un bouton dédié au centre du menu permet de créer rapidement une nouvelle quête, qui viendra s'insérer dans la liste qui lui correspond, et sera accessible dans la modale d'assignation à un hexagone.

<div align="center">
<img src="images/nouvelle-quete.png" width="200" />
</div>

<div align="center">
<em>Modale de création de quête.</em>
</div>

L'interface est pensée pour être intuitive, responsive et agréable à utiliser, afin de maximiser l'engagement et la productivité de l'utilisateur.

# III. Modélisation des données

## 1. <a name='MCDModleConceptueldeDonnes'></a>MCD (Modèle Conceptuel de Données)

<div align="center">
<img src="images/mcd.png" />
</div>

<div align="center">
<em>Schéma de la base de données relationnelle d'Hexaplanning, réalisé avec dbdiagram.io.</em>
</div>

## 2. <a name='MLDModleLogiquedeDonnes'></a>MLD (Modèle Logique de Données)

- Table **UserApp** (Id PK, FirstName, LastName, Email, PasswordHash, CreatedAt, UpdatedAt, IsArchived, ...)
- Table **Quest** (Id PK, Title, Description, EstimatedTime, Advancement, UserId FK, PriorityId FK, StatusId FK, HexAssignmentId FK, CreatedAt, UpdatedAt, IsArchived)
- Table **Priority** (Id PK, Name, Color, BorderColor, Icon, CreatedAt, UpdatedAt, IsArchived)
- Table **Status** (Id PK, Name, Color, Icon, CreatedAt, UpdatedAt, IsArchived)
- Table **HexAssignment** (Id PK, Q, R, S, QuestId FK, CreatedAt, UpdatedAt, IsArchived)
- Table **Mail** (MailTo, MailSubject, MailBody, MailFrom, Receiver)

## 3. <a name='Descriptiondesentitsetrelations'></a>Description des entités et relations

### UserApp (Utilisateur)

- Un utilisateur peut créer plusieurs quêtes.
  Il possède :
  - Un nom et un prénom.
  - Une adresse e-mail unique.
  - Un mot de passe (hashé dans la base de données).
  - Une liste de quêtes.
  - Des métadonnées : date de création, date de mise à jour, statut d'archivage.

### Quest (Quête)

- Une quête appartient à un seul utilisateur.
  Elle possède :
  - Un titre (limité à 100 caractères).
  - Optionnellement, une description.
  - Optionnellement, un temps estimé.
  - Un pourcentage d'avancement (Advancement) pour les quêtes en cours.
  - Un UserId pour la rattacher à son utilisateur.
  - Un PriorityId pour définir sa priorité.
  - Un StatusId pour définir son statut.
  - Optionnellement, un HexAssignmentId pour l'assigner à un hexagone.
  - Des métadonnées : date de création, date de mise à jour, statut d'archivage.

### Priority (Priorité)

- Une priorité peut être associée à plusieurs quêtes.
  Elle possède :
  - Un nom (PRIMARY, SECONDARY, TERTIARY).
  - Une couleur principale.
  - Une couleur de bordure (BorderColor) pour l'affichage sur la carte.
  - Optionnellement, une icône.
  - Des métadonnées : date de création, date de mise à jour, statut d'archivage.

### Status (Statut)

- Un statut peut être associé à plusieurs quêtes.
  Il possède :
  - Un nom (en attente, en cours, terminée).
  - Une couleur pour l'affichage.
  - Optionnellement, une icône.
  - Des métadonnées : date de création, date de mise à jour, statut d'archivage.

### HexAssignment (Assignation d'hexagone)

- Un hexagone (HexAssignment) est lié à une seule quête.
  Il possède :
  - Un jeu de coordonnées q, r, s qui lui est unique (système de coordonnées hexagonales).
  - Un QuestId pour la quête assignée.
  - Des métadonnées : date de création, date de mise à jour, statut d'archivage.

### Mail

- Un mail est indépendant et permet d'envoyer des communications (réinitialisation de mot de passe, bienvenue, etc.).
  Il possède :
  - Un destinataire (MailTo).
  - Un sujet (MailSubject).
  - Un corps de message (MailBody).
  - Un expéditeur (MailFrom).
  - Un destinataire lié à un utilisateur (Receiver).

### Relations principales :

- **UserApp 1:N Quest** : Un utilisateur possède plusieurs quêtes.
- **Quest N:1 Priority** : Une quête a une priorité.
- **Quest N:1 Status** : Une quête a un statut.
- **Quest 1:1 HexAssignment** : Une quête peut être assignée à un hexagone (optionnel).

# IV. Architecture technique et technologies

## 1. <a name='Vuedensemble'></a> Vue d'ensemble

Hexaplanning adopte une architecture moderne en trois couches (3-tier architecture) avec une séparation claire des responsabilités. Le choix des technologies s'est fait en privilégiant la robustesse, la maintenabilité et l'écosystème de chaque solution. L'architecture repose sur :

- **Frontend** : Angular 18 avec PrimeNG pour une interface utilisateur moderne et responsive
- **Backend** : ASP.NET Core 8 pour une API REST performante et sécurisée
- **Base de données** : PostgreSQL pour la persistance des données
- **Infrastructure** : Docker et GitHub Actions pour le déploiement et l'intégration continue
- **Services externes** : Brevo pour l'envoi d'e-mails transactionnels

Cette approche modulaire facilite la maintenance, l'évolutivité et la sécurité de l'application. La communication entre les couches s'effectue via une API REST sécurisée par JWT.

### <a name='Schmaglobal'></a>Schéma global

<div align="center">
<img src="images/schemaglobal.png" />
</div>

<div align="center">
<em>Schéma global de l'architecture d'Hexaplanning.</em>
</div>

## 2. <a name='FrontendAngularetPrimeNG'></a> Frontend : Angular et PrimeNG

### Choix technologiques et justifications

- **Angular 18** : Framework SPA reconnu pour sa structure modulaire, sa maintenabilité et sa communauté active. Il facilite la création d'interfaces dynamiques, responsives et testables. Le choix de la version 18 apporte les dernières optimisations de performance et les nouveautés du framework.

- **PrimeNG** : Bibliothèque de composants UI riche et moderne pour Angular, fournissant les éléments d'interface (modales, formulaires, boutons, toasts) avec un design cohérent et professionnel. Alternative considérée : Angular Material, mais PrimeNG offre plus de composants spécialisés out-of-the-box.

- **TypeScript** : Apporte la sécurité de typage et la clarté du code, essentielle pour un projet d'envergure. Facilite la maintenance et réduit les erreurs de développement.

### Architecture et organisation

- **Structure modulaire** : Organisation en modules fonctionnels (auth, quest, hexagon, settings), composants, services et modèles TypeScript
- **Approche mobile-first** : Interface responsive optimisée pour les appareils mobiles
- **State management** : Services Angular pour la gestion d'état partagé

### Responsabilités principales

- Gestion de l'interface utilisateur et de l'expérience utilisateur
- Navigation entre les différentes pages et modales
- Appels API vers le backend et gestion des réponses
- Gestion du token JWT pour l'authentification
- Affichage dynamique de la carte d'hexagones avec coordonnées hexagonales
- CRUD des quêtes avec validation côté client

### Sécurité

- **Intercepteur HTTP** : Ajout automatique du JWT dans toutes les requêtes API
- **Guards de navigation** : Protection des routes sensibles (authentification requise)
- **Validation des formulaires** : Contrôles côté client avant envoi au backend

### Tests et qualité

- **Jest** : Tests unitaires des composants et services
- **Cypress** : Tests end-to-end pour valider les parcours utilisateur complets
- **ESLint** : Analyse statique du code pour maintenir la qualité

## 3. <a name='BackendNETCore'></a> Backend : .NET Core

### Choix technologiques et justifications

- **ASP.NET Core 8** : Framework backend performant, sécurisé et multiplateforme, idéal pour exposer une API REST robuste et scalable. La version 8 LTS garantit la stabilité et le support à long terme.

- **Entity Framework Core** : ORM facilitant la gestion et la migration de la base de données, tout en assurant la cohérence des modèles. Alternative considérée : Dapper, mais EF Core offre une approche Code-First plus adaptée au projet.

- **ASP.NET Identity** : Système d'authentification et d'autorisation intégré, robuste et éprouvé pour la gestion des utilisateurs et des mots de passe.

### Architecture en couches

L'API suit une architecture en couches claire pour séparer les responsabilités :

- **Controllers** : Points d'entrée API, gestion des requêtes HTTP et des réponses
- **Services** : Logique métier, règles de gestion et orchestration des opérations
- **Models** : Entités de domaine et DTOs pour le transfert de données
- **DataContext** : Couche d'accès aux données avec Entity Framework
- **Utilities** : Classes utilitaires et helpers transversaux

### Responsabilités principales

- **API RESTful** : Exposition des endpoints pour toutes les opérations CRUD
- **Authentification JWT** : Génération et validation des tokens d'authentification
- **Logique métier** : Création/gestion des quêtes, hexagones, utilisateurs, priorités, statuts
- **Validation des données** : Contrôles de cohérence et de sécurité des données
- **Envoi d'e-mails** : Service intégré s'appuyant sur Brevo pour les notifications (réinitialisation de mot de passe, bienvenue)

### Sécurité intégrée

- **Middleware JWT** : Authentification automatique sur tous les endpoints protégés
- **Validation des entrées** : Contrôles stricts sur toutes les données reçues
- **Gestion des droits** : Chaque utilisateur n'accède qu'à ses propres données
- **Protection anti-attaques** : Guards contre l'injection SQL, XSS, CSRF
- **Rate limiting** : Protection contre les tentatives de force brute

### Tests et qualité

- **xUnit** : Framework de tests unitaires moderne et flexible, intégré à l'écosystème .NET
- **Tests d'intégration** : Validation complète des endpoints avec base de données de test
- **Testcontainers** : Tests sur PostgreSQL réel pour une validation authentique

## 4. <a name='BasededonnesPostgreSQL'></a> Base de données : PostgreSQL

### Choix technologique et justifications

- **PostgreSQL** : SGBD open source reconnu pour sa fiabilité, ses performances et ses capacités avancées (transactions ACID, indexation complexe, support JSON, etc.). Alternatives considérées : MySQL (moins de fonctionnalités avancées), SQL Server (coût des licences).

### Modélisation et structure

- **Respect du MCD/MLD** : Implementation fidèle du modèle conceptuel présenté au chapitre III
- **Relations normalisées** : Base de données en 3ème forme normale pour éviter la redondance
- **Entités principales** : UserApp, Quest, Priority, Status, HexAssignment, Mail
- **Contraintes d'intégrité** : Clés étrangères, contraintes CHECK et UNIQUE pour la cohérence des données

### Gestion et évolution

- **Migrations Entity Framework Core** : Versioning automatique du schéma de base de données
- **Code-First approach** : Génération du schéma à partir des modèles C#
- **Seeding** : Données initiales (priorités, statuts) injectées automatiquement
- **Backup et restauration** : Stratégies de sauvegarde régulières en production

### Performance et optimisation

- **Indexation** : Index sur les clés étrangères et champs de recherche fréquents
- **Requêtes optimisées** : Utilisation d'LINQ pour des requêtes efficaces
- **Connection pooling** : Gestion optimale des connexions base de données

### Sécurité

- **Accès restreint** : Connexion uniquement via l'API backend, aucun accès direct
- **Chiffrement** : Connexions SSL/TLS obligatoires
- **Isolation des données** : Chaque utilisateur accède uniquement à ses propres données
- **Credentials sécurisés** : Mots de passe hashés avec ASP.NET Identity

## 5. <a name='CommunicationAPIREST'></a> Communication API REST

### Architecture RESTful

- **Format de données** : JSON via HTTP(S) pour tous les échanges
- **Verbes HTTP** : Utilisation sémantique (GET, POST, PUT, DELETE)
- **Codes de réponse** : Status codes HTTP appropriés (200, 201, 400, 401, 404, 500)
- **Structure des URLs** : Routes RESTful cohérentes (`/api/quests`, `/api/users/{id}`)

### Endpoints principaux

- **Authentification** : `/api/auth/login`, `/api/auth/register`, `/api/auth/reset-password`
- **Gestion des quêtes** : CRUD complet sur `/api/quests` avec filtrage par utilisateur
- **Gestion des hexagones** : `/api/hexassignments` pour l'assignation des quêtes
- **Gestion des utilisateurs** : `/api/users` pour les profils et paramètres
- **Données de référence** : `/api/priorities`, `/api/statuses` pour les listes déroulantes

### Sécurité et authentification

- **JWT Bearer Token** : Toutes les routes sensibles protégées par authentification
- **CORS configuré** : Origines autorisées limitées aux domaines de l'application
- **Rate limiting** : Protection contre les abus et attaques par déni de service
- **Validation des données** : Contrôles stricts sur tous les inputs API

### Gestion des erreurs

- **Réponses structurées** : Format JSON consistent pour les erreurs
- **Messages explicites** : Informations claires pour le débogage côté frontend
- **Logs centralisés** : Traçabilité complète des erreurs serveur

## 6. <a name='InfrastructureetDevOps'></a> Infrastructure et DevOps

### Conteneurisation

- **Docker** : Conteneurisation de chaque composant pour garantir la portabilité, l'isolation et la reproductibilité des environnements. Chaque service (frontend, backend, base de données) dispose de son propre Dockerfile optimisé.

- **docker-compose** : Orchestration simplifiée du déploiement multi-conteneurs. Gestion des dépendances entre services, des variables d'environnement et des volumes persistants.

### Intégration et déploiement continu

- **GitHub Actions** : Automatisation des pipelines CI/CD pour des livraisons rapides et sûres. Pipelines séparés pour le frontend et le backend avec tests automatisés.

- **Workflow CI** : Tests unitaires et d'intégration automatiques avant chaque déploiement
- **Workflow CD** : Build, push vers Docker Hub et déploiement automatique sur le VPS

### Hébergement et infrastructure

- **OVH VPS** : Hébergement flexible et sécurisé, adapté à la montée en charge. Serveur Linux Ubuntu avec Docker et docker-compose installés.

- **Nginx Proxy Manager** : Gestion centralisée des domaines, des certificats SSL et du reverse proxy. Interface web pour la configuration des routes et des certificats Let's Encrypt automatiques.

### Monitoring et maintenance

- **Logs centralisés** : Collecte et analyse des logs applicatifs pour le debugging
- **Health checks** : Surveillance de l'état des services Docker
- **Backup automatique** : Sauvegardes régulières de la base de données
- **Mises à jour sécurisées** : Processus de mise à jour des dépendances et images Docker

## 7. <a name='Servicesexternes'></a> Services externes

### Brevo (ex-Sendinblue)

- **Service d'emailing transactionnel** : Solution cloud fiable et simple à intégrer pour l'envoi d'e-mails automatisés
- **Utilisation** : Envoi de mails de réinitialisation de mot de passe, messages de bienvenue, notifications importantes
- **Avantages** : API simple, bonne délivrabilité, tarification adaptée aux petits volumes
- **Alternative considérée** : SendGrid, mais Brevo offre une interface plus intuitive et des tarifs plus avantageux pour un projet de cette envergure

### Justification du choix

L'externalisation de l'envoi d'e-mails vers Brevo permet :

- **Fiabilité** : Infrastructure spécialisée avec haute disponibilité
- **Délivrabilité** : Réputation IP préservée et conformité aux standards anti-spam
- **Simplicité** : Pas de gestion de serveur SMTP interne
- **Coût** : Solution économique par rapport à l'hébergement d'un serveur mail

## 8. <a name='Scuritetbonnespratiques'></a> Sécurité et bonnes pratiques

L'application implémente une stratégie de sécurité multicouche couvrant l'authentification, la protection des données et la sécurisation de l'infrastructure.

### Authentification et gestion des identités

- **ASP.NET Identity** : Framework robuste intégré à .NET Core pour la gestion complète des utilisateurs
- **JWT (JSON Web Tokens)** : Authentification stateless sécurisée avec signature cryptographique
- **Hachage des mots de passe** : Utilisation d'algorithmes sécurisés (PBKDF2) avec salage automatique
- **Réinitialisation sécurisée** : Tokens temporaires à usage unique pour la récupération de mot de passe
- **Validation d'email** : Confirmation d'identité via email avec tokens d'activation

### Protection contre les attaques web

- **CSRF Protection** : Tokens anti-contrefaçon sur toutes les opérations sensibles
- **XSS Prevention** : Échappement automatique des données utilisateur, Content Security Policy stricte
- **SQL Injection** : Utilisation d'Entity Framework avec requêtes paramétrées
- **Validation des entrées** : Sanitisation côté serveur et client avec Data Annotations
- **Rate Limiting** : Protection contre les attaques par déni de service et force brute

### Sécurité de l'infrastructure

- **HTTPS obligatoire** : Chiffrement TLS 1.2+ en production avec redirection automatique
- **Headers de sécurité** : HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **CORS restrictif** : Configuration précise des origines autorisées pour les requêtes cross-origin
- **Isolation des conteneurs** : Docker avec utilisateurs non-privilégiés et réseaux isolés
- **Variables d'environnement** : Secrets stockés de manière sécurisée, jamais dans le code source

### Bonnes pratiques de développement

- **Principe du moindre privilège** : Accès limité aux ressources strictement nécessaires
- **Gestion des erreurs** : Messages d'erreur génériques pour éviter la fuite d'informations
- **Logging sécurisé** : Traçabilité des actions sensibles sans exposition de données personnelles
- **Mise à jour régulière** : Surveillance et application des correctifs de sécurité
- **Tests de sécurité** : Validation automatisée des vulnérabilités connues

Cette architecture garantit robustesse, évolutivité et sécurité, tout en permettant une expérience utilisateur fluide et moderne.

# V. Qualité logicielle et tests

La qualité logicielle d’Hexaplanning repose sur une stratégie de tests complète, principalement concentrée sur l’API .NET, afin de garantir la robustesse, la fiabilité et la maintenabilité du backend.

## 1. <a name='Testsunitairesbackend'></a> Tests unitaires (backend)

Les tests unitaires sont réalisés avec xUnit et couvrent les principaux services métiers, notamment le service de gestion des quêtes (`QuestService`). Ces tests vérifient le bon fonctionnement des méthodes de création, lecture, mise à jour et suppression de quêtes, ainsi que la gestion des cas limites (identifiants invalides, absence de données, etc.).

Exemples de méthodes testées :

- Création d’une quête (`CreateQuestAsync`)
- Récupération d’une quête par ID (`GetQuestByIdAsync`)
- Mise à jour et suppression de quêtes (`UpdateQuestAsync`, `DeleteQuestAsync`)
- Récupération des quêtes selon leur statut (en attente, terminées, non assignées)

## 2. <a name='Testsdintgration'></a> Tests d’intégration

Des tests d’intégration automatisés valident l’ensemble du pipeline API, de la couche HTTP jusqu’à la base de données PostgreSQL (via Testcontainers). Ils simulent des scénarios réels, comme la récupération de quêtes via des requêtes authentifiées, la gestion des droits d’accès, et la cohérence des données persistées.

Caractéristiques :

- Utilisation de `WebApplicationFactory` pour lancer l’API en environnement de test
- Base de données PostgreSQL éphémère (Testcontainers)
- Données de test injectées automatiquement (utilisateur, quêtes)
- Vérification de la sécurité (JWT requis, accès refusé si non authentifié)

## 3. <a name='Testsdechargeetfixtures'></a> Tests de charge et fixtures

Des fixtures de données sont utilisées pour simuler des volumes importants de quêtes et d’utilisateurs, grâce à la librairie Bogus. Cela permet de valider la tenue en charge de l’API et la stabilité des traitements sur de grands ensembles de données. Les tests ont été réalisés avec 100000 utilisateurs et 1000000 de quêtes pour s'assurer de la robustesse de la base de données.

## 4. <a name='Stratgiedevalidation'></a> Stratégie de validation

Chaque nouvelle fonctionnalité ou correction de bug s’accompagne de tests dédiés. Les tests sont exécutés automatiquement lors des pipelines CI/CD (GitHub Actions), garantissant l’absence de régressions avant chaque déploiement. La couverture de code est régulièrement analysée pour cibler les zones à renforcer.

Cette démarche assure un haut niveau de confiance dans la qualité logicielle du backend, tout en facilitant l’évolution continue du projet.

# VI. Déploiement et intégration continue

L’automatisation du déploiement et de l’intégration continue est assurée par des pipelines GitHub Actions distincts pour le frontend Angular et l’API .NET. Cette organisation garantit des mises en production fiables, rapides et reproductibles.

## 1. <a name='IntgrationcontinueCIdelAPI'></a> Intégration continue (CI) de l’API

Un pipeline CI dédié à l’API .NET s’exécute à chaque push sur la branche `main` :

- **Tests unitaires** : Compilation et exécution des tests unitaires (`dotnet test ./TestsUnitaires`)
- **Tests d’intégration** : Lancement des tests d’intégration sur une base PostgreSQL éphémère (`dotnet test ./TestsIntegration`)
- **Vérification de la qualité** : Toute régression ou échec bloque la suite du pipeline

Extrait du workflow :

```yaml
jobs:
   test-unitaire:
      ...
      - run: dotnet test --no-build --verbosity normal ./TestsUnitaires
   test-integration:
      ...
      - run: dotnet test --no-build --verbosity detailed  ./TestsIntegration
```

## 2. <a name='DploiementcontinuCDdubackend'></a> Déploiement continu (CD) du backend

Le backend .NET dispose également d’un pipeline CD automatisé. Celui-ci ne se déclenche que si le pipeline CI de l’API s’est terminé avec succès (`workflow_run`). Il effectue les étapes suivantes :

- **Build Docker** : Construction de l’image Docker de l’API
- **Push Docker** : Publication de l’image sur Docker Hub
- **Déploiement VPS** : Connexion SSH au serveur OVH, pull de la nouvelle image et redémarrage du conteneur backend via `docker compose`

Extrait du workflow :

```yaml
on:
   workflow_run:
      workflows: ["CI pipeline for the API"]
      types:
         - completed
jobs:
   build-and-deploy:
      ...
      - run: docker build -t antoinespr/hexaplanning-api:dev1 .
      - run: docker push antoinespr/hexaplanning-api:dev1
      - uses: appleboy/ssh-action@v1.0.0
         with:
            script: |
               docker pull antoinespr/hexaplanning-api:dev1
               docker compose -f /home/ubuntu/backend/docker-compose.yml up -d --force-recreate
```

Le frontend Angular dispose d’un pipeline CD qui automatise la construction, la publication et le déploiement sur le serveur de production :

- **Build Docker** : Construction de l’image Docker de l’application Angular
- **Push Docker** : Publication de l’image sur Docker Hub
- **Déploiement VPS** : Connexion SSH au serveur OVH, pull de la nouvelle image et redémarrage du conteneur via `docker compose`

Extrait du workflow :

```yaml
jobs:
   deploy:
      ...
      - run: docker build --target prod-runtime -t antoinespr/hexaplanning-front:dev1 .
      - run: docker push antoinespr/hexaplanning-front:dev1
      - uses: appleboy/ssh-action@v1.0.0
         with:
            script: |
               docker pull antoinespr/hexaplanning-front:dev1
               docker compose -f /home/ubuntu/frontend/docker-compose.yml up -d --force-recreate
```

## 3. <a name='DploiementcontinuCDdufrontend'></a> Déploiement continu (CD) du frontend

Le frontend Angular bénéficie d’un pipeline CD dédié, déclenché à chaque mise à jour de la branche principale. Ce pipeline prend en charge l’ensemble du cycle de livraison : il construit l’application en mode production, génère une image Docker optimisée, la publie sur Docker Hub, puis orchestre le déploiement sur le serveur distant. L’automatisation garantit que la dernière version du frontend est toujours disponible en production, sans intervention manuelle.

Le pipeline s’appuie sur GitHub Actions et utilise des secrets pour sécuriser l’accès au registre Docker et au serveur. L’étape de déploiement s’effectue via SSH, assurant un redémarrage fluide du conteneur frontend sans interruption de service pour les utilisateurs.

Extrait du workflow :

```yaml
jobs:
   deploy:
      ...
      - run: docker build --target prod-runtime -t antoinespr/hexaplanning-front:dev1 .
      - run: docker push antoinespr/hexaplanning-front:dev1
      - uses: appleboy/ssh-action@v1.0.0
         with:
            script: |
               docker pull antoinespr/hexaplanning-front:dev1
               docker compose -f /home/ubuntu/frontend/docker-compose.yml up -d --force-recreate
```

## 4. <a name='Conteneurisationetorchestration'></a> Conteneurisation et orchestration

Chaque composant (frontend, backend, base de données) dispose de son propre Dockerfile. Le déploiement s’effectue via `docker compose`, facilitant la gestion, la montée en charge et la maintenance.

## 5. <a name='Hbergementetreverseproxy'></a> Hébergement et reverse proxy

L’application est hébergée sur un VPS OVH, avec Nginx Proxy Manager pour la gestion des domaines et des certificats SSL. Cette architecture assure la sécurité, la disponibilité et la scalabilité du service.

Cette chaîne CI/CD garantit des livraisons rapides, sûres et automatisées, tout en limitant les interventions manuelles et les risques d’erreur.

Le résultat final est disponible sous le nom de domaine hexaplanning.fr.

# VII. Sécurité

La sécurité est un pilier central d’Hexaplanning, intégrée à tous les niveaux de l’architecture pour garantir la confidentialité, l’intégrité et la disponibilité des données utilisateurs.

## 1. <a name='Authentificationetgestiondesaccs'></a> Authentification et gestion des accès

- **JWT (JSON Web Token)** : Toutes les opérations sensibles nécessitent une authentification par token JWT, généré lors de la connexion et vérifié à chaque requête côté backend.
- **Guards et Intercepteurs** : Le frontend Angular utilise des guards pour protéger les routes et un intercepteur HTTP pour injecter automatiquement le token dans les requêtes API.

## 2. <a name='Validationetintgritdesdonnes'></a> Validation et intégrité des données

- **Validation systématique** : Toutes les entrées utilisateur sont validées côté backend (.NET) pour éviter les injections, incohérences ou données malformées.
- **Gestion des erreurs** : Les erreurs sont centralisées et les messages d’erreur ne révèlent jamais d’informations sensibles.

## 3. <a name='Protectioncontrelesattaques'></a> Protection contre les attaques

- **Force brute** : Limitation du nombre de tentatives de connexion et gestion des comptes bloqués après plusieurs échecs.
- **CORS** : Configuration stricte des origines autorisées pour l’API.
- **Sécurité des mots de passe** : Hashage fort (ASP.NET Identity), politique de complexité et gestion sécurisée du reset via email (Brevo).

## 4. <a name='Scuritdelaconteneurisationetdudploiement'></a> Sécurité de la conteneurisation et du déploiement

- **Isolation** : Chaque composant (frontend, backend, base de données) s’exécute dans un conteneur dédié.
- **Secrets** : Les secrets (tokens, clés, mots de passe) sont stockés dans les variables d’environnement et jamais dans le code source.
- **Reverse proxy** : Nginx Proxy Manager gère les certificats SSL et protège l’accès aux services.

## 5. <a name='Surveillanceetaudit'></a> Surveillance et audit

- **Logs** : Les actions critiques sont journalisées côté backend pour permettre un audit et une détection rapide d’anomalies.
- **Mises à jour** : Les dépendances et images Docker sont régulièrement mises à jour pour corriger les vulnérabilités.

Cette approche globale permet de garantir un haut niveau de sécurité pour les utilisateurs et les données de la plateforme.

# VIII. Conclusion et perspectives

## 1. <a name='viii-1-bilan-du-projet'></a> Bilan du projet

Hexaplanning a permis de concevoir et de mettre en production une application web moderne, robuste et sécurisée, centrée sur l’expérience utilisateur et la gamification de la gestion de tâches. Le découpage clair entre frontend Angular et backend .NET, la modélisation soignée des entités (quêtes, utilisateurs, hexagones), ainsi que l’automatisation des tests et du déploiement, ont permis d’atteindre un haut niveau de qualité logicielle.

Les fonctionnalités principales sont opérationnelles : création et gestion de quêtes, affichage visuel sur carte hexagonale, authentification sécurisée, gestion des mots de passe, et notifications par email. L’architecture modulaire et la conteneurisation facilitent la maintenance et l’évolutivité.

## 2. <a name='viii-2-perspectives-d-évolution'></a> Perspectives d'évolution

Les évolutions futures d’Hexaplanning s’articulent autour de plusieurs axes fonctionnels et techniques, en lien direct avec les besoins utilisateurs et la structure du code :

- **Sécurité et gestion des comptes**

  - Ajout d’un système de refresh token (stocké localement ou en cookies) pour renforcer la sécurité et la gestion de session.
  - Envoi d’un email de bienvenue et de confirmation à la création du compte.
  - Création d’un dashboard administrateur pour gérer les utilisateurs.

- **Liste de quêtes**

  - Ajout d'options de tri pour l'ordre d'affichage des quêtes : par date de création, par priorité ou personnalisé.
  - Ajout du drag & drop pour réorganiser les quêtes dans un ordre personnalisé.
  - Ajout de catégories personnalisables pour faciliter l'organisation.
  - Ajout d'un sélecteur de priorité directement depuis la liste.
  - Implémentation du glissement tactile sur mobile pour naviguer d'un menu à l'autre (quêtes à accomplir / quêtes accomplies).

- **Détails des quêtes**

  - Ajout d'une option pour rendre les quêtes répétables et permettre de les placer plusieurs fois sur la carte d'hexagones.
  - Ajout d'options dates pour organiser les quêtes dans le temps (date d'exécution prévue ou deadline).
  - Regroupement de quêtes en "expédition" avec un objectif final, chaque quête devenant une étape de la progression.

- **Carte d'hexagones**

  - Extension de la carte pour ajouter davantage de quêtes, voire extension automatique dès qu'un hexagone proche du bord est rempli.
  - Multiplication des cartes pour séparer les quêtes par catégorie.
  - Implémentations d'une navigation plus intuitive avec option de zoom et navigation à la souris ou au doigt.
  - Ajout de filtres pour masquer les quêtes par état (accomplies / non accomplies) et par priorité, pour permettre à l'utilisateur de se concentrer sur les tâches les plus urgentes sans être distrait par les suivantes, ou simplement de personnaliser son affichage.
  - Amélioration du système d'assignation des quêtes aux hexagones en permettant de déplacer une quête en drag & drop.
  - Ajout de flèches pour indiquer le sens de progression d’une quête à l’autre.
  - Ajout d’une mécanique de personnages se déployant sur la carte comme des soldats conquérant un territoire hexagonal après l'autre, ou d'un personnage seul progressant de façon linéaire jusqu'à un objectif.

- **Personnalisation**

  - Ajout d'un avatar pour l'utilisateur.
  - Personnalisation des couleurs (thème de l'application, texte des priorités dans les détails de quêtes, liseré des priorités dans la carte d'hexagones).
  - Personnalisation des unités déployables sur la carte (une fois faite l'implémentation d'un ou plusieurs personnages évoluant sur la carte).

- **Déploiement futur**
  - Création d'une application mobile en utilisant Ionic, et déploiement sur les stores Android et iOS.
  - Système de notifications.
  - Persistance des données utilisateurs en les stockant sur l'AsyncStorage de l'appareil afin d'éviter d'avoir à se reconnecter à chaque ouverture de l'app.

L’architecture actuelle, modulaire et évolutive, permet d’intégrer ces améliorations de façon progressive, tout en maintenant la stabilité et la sécurité de la plateforme.

---
