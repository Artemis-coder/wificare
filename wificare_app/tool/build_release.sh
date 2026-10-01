#!/usr/bin/env bash
#
# Compile l'APK de release et le nomme d'après l'application.
#
# `flutter build apk` produit « app-release.apk » : le nom vient du module
# Gradle et ne dit rien à la personne qui reçoit le fichier. Sur un téléphone,
# dans une conversation ou une liste de téléchargements, ce nom est pourtant la
# première chose qui identifie le fichier. AGP 9 ne permet plus de renommer la
# sortie depuis Gradle (`outputFileName` a été retiré de l'API de variants), le
# renommage se fait donc ici, après la compilation.
#
# Le nom produit est « WiFiCare-<version>.apk », la version étant lue dans
# pubspec.yaml : plusieurs versions peuvent coexister chez un même destinataire
# sans qu'il doive deviner laquelle est la plus récente.
#
# Usage :
#   tool/build_release.sh                        # cible la production déployée
#   API_BASE_URL=http://10.0.2.2:3000/api tool/build_release.sh
#
# L'API par défaut est celle de la production. Utiliser le serveur local n'a de
# sens que pour un test sur émulateur : une application distribuée à des
# utilisateurs réels ne doit pas dépendre d'un poste de développement.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# Nom de l'application. Doit correspondre au libellé de l'application dans
# android/app/src/main/AndroidManifest.xml (`android:label`) et à la marque
# affichée par le site.
APP_NAME="WiFiCare"
DEFAULT_API_BASE_URL="https://wificare-web.vercel.app/api"

if ! command -v flutter >/dev/null 2>&1; then
  echo "flutter est introuvable dans le PATH." >&2
  echo "Ajouter \$(dirname \$(dirname \$(which flutter)))/bin au PATH." >&2
  exit 1
fi

# Version de l'application : champ `version:` de pubspec.yaml, partie avant le
# « + » (celle qui est lisible, versionCode est la partie après).
VERSION="$(sed -n 's/^version:[[:space:]]*\([^+[:space:]]*\).*/\1/p' pubspec.yaml)"

if [ -z "$VERSION" ]; then
  echo "Version introuvable dans pubspec.yaml." >&2
  exit 1
fi

API_BASE_URL="${API_BASE_URL:-$DEFAULT_API_BASE_URL}"
OUTPUT_DIR="build/app/outputs/flutter-apk"
BUILT_APK="$OUTPUT_DIR/app-release.apk"
FINAL_APK="$OUTPUT_DIR/${APP_NAME}-${VERSION}.apk"

echo "Compilation de ${APP_NAME} ${VERSION}…"
echo "API : ${API_BASE_URL}"

flutter build apk --release --dart-define="API_BASE_URL=${API_BASE_URL}"

if [ ! -f "$BUILT_APK" ]; then
  echo "APK introuvable à l'emplacement attendu : ${BUILT_APK}" >&2
  exit 1
fi

# Déplacement, pas copie : le dossier de sortie ne doit contenir qu'un APK, sans
# quoi on risque d'installer le mauvais par erreur.
mv "$BUILT_APK" "$FINAL_APK"

echo
echo "APK prêt : ${APP_DIR}/${FINAL_APK}"
ls -lh "$FINAL_APK" | awk '{print "Taille : " $5}'
