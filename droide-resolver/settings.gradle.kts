pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
    buildscript {
        repositories {
            maven {
                name = "R8Releases"
                url = uri("https://storage.googleapis.com/r8-releases/raw")
                content { includeModule("com.android.tools", "r8") }
            }
            google(); mavenCentral()
        }
        dependencies { classpath("com.android.tools:r8:9.1.29") }
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "DroideDependencyResolver"
include(":app")
