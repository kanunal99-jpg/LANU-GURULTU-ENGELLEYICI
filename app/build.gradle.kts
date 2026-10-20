plugins { alias(libs.plugins.android.application) }

// Bake in a fixed public binary-only feed even before its first release.
// Once that feed is published, installed production builds work without an
// app-side reconfiguration or another bootstrap APK.
val defaultOtaManifestUrl = "https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json"
val otaManifestUrl = providers.environmentVariable("LANU_OTA_MANIFEST_URL").orNull
    ?.takeIf { it.isNotBlank() } ?: defaultOtaManifestUrl
require(otaManifestUrl == defaultOtaManifestUrl) {
    "OTA manifest must point to the pinned binary-only LANU-LENS-OTA repository"
}

android {
    namespace = "com.lanu.sesli"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    // This is a public certificate digest, never the private signing key.
    val pinnedReleaseCert = providers.environmentVariable("LANU_RELEASE_CERT_SHA256").orNull.orEmpty()
        .lowercase().replace(":", "").trim()
    require(pinnedReleaseCert.isEmpty() || pinnedReleaseCert.matches(Regex("[0-9a-f]{64}"))) {
        "Invalid OTA certificate fingerprint"
    }
    signingConfigs {
        val storePath = providers.environmentVariable("LANU_SIGNING_STORE_FILE").orNull
        val storePass = providers.environmentVariable("LANU_SIGNING_STORE_PASSWORD").orNull
        val alias = providers.environmentVariable("LANU_SIGNING_KEY_ALIAS").orNull
        val keyPass = providers.environmentVariable("LANU_SIGNING_KEY_PASSWORD").orNull
        if (!storePath.isNullOrBlank() && !storePass.isNullOrBlank()
            && !alias.isNullOrBlank() && !keyPass.isNullOrBlank()) {
            create("otaRelease") {
                storeFile = file(storePath)
                storePassword = storePass
                keyAlias = alias
                keyPassword = keyPass
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfigs.findByName("otaRelease")?.let { signingConfig = it }
        }
    }
    defaultConfig {
        applicationId = "com.lanu.sesli"
        minSdk = 26
        targetSdk = 35
        versionCode = providers.environmentVariable("LANU_VERSION_CODE").orNull?.toInt() ?: 1
        versionName = "2.0.10"
        buildConfigField("String", "OTA_MANIFEST_URL", "\"$otaManifestUrl\"")
        buildConfigField("String", "OTA_RELEASE_CERT_SHA256", "\"$pinnedReleaseCert\"")
        testInstrumentationRunner = "com.lanu.sesli.SmokeInstrumentation"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true }
}
dependencies {
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.core)
}
