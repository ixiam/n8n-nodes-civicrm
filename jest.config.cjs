module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  moduleNameMapper: {
    "^n8n-workflow$": "<rootDir>/node_modules/n8n-workflow",
    "^n8n-core$": "<rootDir>/node_modules/n8n-core"
  }
};