import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("java")
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "io.github.nlsjjy84ui"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2024.2.5")
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.google.code.gson:gson:2.11.0")
    testImplementation("org.opentest4j:opentest4j:1.3.0")
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "242"
            untilBuild = provider { null }
        }
    }
    buildSearchableOptions = false
}

tasks.test {
    systemProperty("file.encoding", "UTF-8")
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = false
    }
}
