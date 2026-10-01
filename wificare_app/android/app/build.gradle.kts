plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Firebase n'est appliqué que si le fichier de configuration est présent.
//
// Sans `google-services.json`, le plugin échoue à la compilation : or le
// fichier dépend d'un projet Firebase externe, il ne peut pas être versionné.
// L'application doit donc rester compilable dans son état, en se passant
// simplement de notifications push (cf. `core/push/push_service.dart`, qui
// absorbe l'échec d'initialisation). Déposer le fichier dans
// `android/app/google-services.json` suffit à activer le push, sans toucher
// au Gradle.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.wificare.mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // `flutter_local_notifications` utilise des API Java récentes
        // (java.time) absentes des runtimes Android plus anciens : le
        // désucrage les réécrit pour les versions qui les ignorent.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "com.wificare.mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // Signature de debug : l'APK est installable mais NON publiable.
            // Pour une publication, générer une keystore et renseigner
            // key.properties (voir AGENTS.md).
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
