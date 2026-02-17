const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withFirebaseModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      let podfileContents = fs.readFileSync(podfilePath, "utf8");

      const modularHeadersDeps = [
        "GoogleUtilities",
        "GoogleDataTransport",
        "nanopb",
        "FirebaseCore",
        "FirebaseCoreExtension",
        "FirebaseInstallations",
        "FirebaseRemoteConfigInterop",
      ];

      const podModifications = modularHeadersDeps
        .map((dep) => `  pod '${dep}', :modular_headers => true`)
        .join("\n");

      const marker = "# --- Firebase Modular Headers ---";

      if (!podfileContents.includes(marker)) {
        const targetLine = podfileContents.match(
          /target ['"].*?['"] do/
        );
        if (targetLine) {
          podfileContents = podfileContents.replace(
            targetLine[0],
            `${targetLine[0]}\n${marker}\n${podModifications}\n${marker}`
          );
        }
      }

      fs.writeFileSync(podfilePath, podfileContents);
      return config;
    },
  ]);
}

module.exports = withFirebaseModularHeaders;
