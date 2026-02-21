module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/billing"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@shared/(.*)$": "<rootDir>/shared/$1",
  },
  transform: {
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
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
};
