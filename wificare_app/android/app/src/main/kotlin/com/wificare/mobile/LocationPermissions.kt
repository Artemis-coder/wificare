package com.wificare.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Vérification des autorisations de localisation, et messages associés.
 *
 * Les messages sont rédigés ici, en français, et renvoyés tels quels à Dart :
 * l'écran technicien les affiche tels quels, et un texte technique affiché au
 * technicien (« SecurityException ») serait incompréhensible pour lui.
 */
object LocationPermissions {

    /**
     * Localisation autorisée au premier plan.
     *
     * `ACCESS_COARSE_LOCATION` suffit à démarrer le service, mais le suivi d'un
     * trajet demande `ACCESS_FINE_LOCATION` : c'est la précision qui permet au
     * serveur de calculer une ETA crédible.
     */
    fun hasLocation(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * Localisation autorisée alors que l'application n'est plus au premier plan.
     *
     * Android 10 (API 29) a séparé cette autorisation de la précédente, et
     * Android 14 (API 34) refuse purement et simplement d'ouvrir un service de
     * premier plan de type localisation sans elle. C'est la raison pour laquelle
     * le service doit pouvoir s'arrêter proprement sur un refus au lieu de
     * planter : le technicien voit alors un écran de suivi « indisponible » et
     * peut continuer son intervention.
     */
    fun hasBackgroundLocation(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    const val LOCATION_DENIED =
        "Autorisation de localisation refusée : le client ne verra pas votre arrivée estimée. " +
            "Vous pouvez continuer votre intervention normalement."

    const val BACKGROUND_DENIED =
        "Autorisation de localisation en arrière-plan refusée : Android interdit au suivi " +
            "de continuer quand l'application est fermée. Activez-la dans les réglages pour " +
            "que le client suive votre arrivée."

    const val MISSING_SESSION =
        "Aucune demande à suivre : le suivi n'a pas pu démarrer."
}
