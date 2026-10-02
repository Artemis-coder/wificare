# WiFi Care - Démarrage rapide

Le README complet est ici : [README.md](README.md). Ce document ne couvre que
le minimum pour lancer les deux morceaux.

## Prérequis

| Outil | Version | Rôle |
| --- | --- | --- |
| Node.js | 20 ou plus | back-office web et API REST |
| Flutter | 3.47 stable | application mobile Android |
| JDK | 17 ou plus | compilation Android (le JBR d'Android Studio suffit) |
| Android SDK | 36 | `flutter build apk` |

## Back-office web

```bash
npm install
cp .env.example .env      # puis renseigner DATABASE_URL et NEXTAUTH_SECRET
npx prisma db push
npm run dev
```

L'application sert aussi l'API REST que consomme le mobile, sur la même origine.

## Application mobile

```bash
cd mobile
flutter pub get
flutter run
```

Pour cibler un émulateur Android depuis le serveur web local :

```bash
API_BASE_URL=http://10.0.2.2:3000/api flutter run
```

Sans ce réglage, l'application interroge l'API de production.

## APK de distribution

```bash
cd mobile
tool/build_release.sh
# -> mobile/build/app/outputs/flutter-apk/WiFiCare-1.0.0.apk
```

Le script compile en release, vise la production et renomme la sortie. La
version est lue dans `mobile/pubspec.yaml`.

## Notifications push sur Android

Facultatif : sans ce fichier, l'application compile et fonctionne, aucun
téléphone ne sonne.

```bash
cp Firebase/google-services.json mobile/android/app/google-services.json
```

`Firebase/` est hors du dépôt — il contient une clé de compte de service. Le
fichier déposé dans `mobile/android/app/` ne l'est pas davantage : il est listé
dans `.gitignore`.

## Vérifier avant de livrer

```bash
npm run lint && npm run typecheck && npm run build   # web
cd mobile && flutter analyze && flutter test        # mobile
```
