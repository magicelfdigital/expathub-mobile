const tsJestTransform = {
  "^.+\\.tsx?$": [
    "ts-jest",
    {
      tsconfig: {
        module: "commonjs",
        target: "es2020",
        esModuleInterop: true,
        jsx: "react-jsx",
        strict: true,
        baseUrl: ".",
        paths: {
          "@/*": ["./*"],
          "@shared/*": ["./shared/*"],
        },
      },
    },
  ],
};

const sharedModuleNameMapper = {
  "^@/(.*)$": "<rootDir>/$1",
  "^@shared/(.*)$": "<rootDir>/shared/$1",
};

module.exports = {
  projects: [
    {
      displayName: "billing",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/src/billing"],
      moduleNameMapper: {
        ...sharedModuleNameMapper,
        "^react-native$": "<rootDir>/src/billing/__mocks__/react-native.ts",
      },
      transform: tsJestTransform,
      testMatch: ["**/__tests__/**/*.test.ts"],
    },
    {
      displayName: "server",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/server"],
      moduleNameMapper: sharedModuleNameMapper,
      transform: tsJestTransform,
      testMatch: ["**/__tests__/**/*.test.ts"],
    },
    {
      displayName: "data",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/src/data", "<rootDir>/src/onboarding"],
      moduleNameMapper: sharedModuleNameMapper,
      transform: tsJestTransform,
      testMatch: ["**/__tests__/**/*.test.ts"],
    },
    {
      displayName: "lib",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/src/lib"],
      moduleNameMapper: {
        ...sharedModuleNameMapper,
        "^react-native$": "<rootDir>/src/billing/__mocks__/react-native.ts",
        "^@react-native-async-storage/async-storage$":
          "<rootDir>/src/lib/__mocks__/async-storage.ts",
        "^posthog-react-native$":
          "<rootDir>/src/lib/__mocks__/posthog-react-native.ts",
      },
      transform: tsJestTransform,
      testMatch: ["**/__tests__/**/*.test.ts"],
    },
    {
      displayName: "hooks",
      preset: "ts-jest",
      testEnvironment: "jsdom",
      roots: ["<rootDir>/src/hooks"],
      moduleNameMapper: sharedModuleNameMapper,
      transform: tsJestTransform,
      testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    },
    {
      displayName: "contexts",
      preset: "ts-jest",
      testEnvironment: "jsdom",
      roots: ["<rootDir>/contexts", "<rootDir>/src/contexts"],
      moduleNameMapper: {
        ...sharedModuleNameMapper,
        "^react-native$": "<rootDir>/src/contexts/__mocks__/react-native.ts",
        "^@react-native-async-storage/async-storage$":
          "<rootDir>/src/lib/__mocks__/async-storage.ts",
        "^posthog-react-native$":
          "<rootDir>/src/lib/__mocks__/posthog-react-native.ts",
      },
      transform: tsJestTransform,
      testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    },
    {
      displayName: "screens",
      preset: "ts-jest",
      testEnvironment: "jsdom",
      roots: ["<rootDir>/app"],
      moduleNameMapper: sharedModuleNameMapper,
      setupFiles: ["<rootDir>/src/__test-mocks__/screens-setup.ts"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: {
              module: "commonjs",
              target: "es2020",
              esModuleInterop: true,
              jsx: "react-jsx",
              strict: false,
              noImplicitAny: false,
              baseUrl: ".",
              paths: {
                "@/*": ["./*"],
                "@shared/*": ["./shared/*"],
              },
              types: ["jest", "node"],
            },
          },
        ],
      },
      testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    },
  ],
};
