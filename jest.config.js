module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "./src",
  watchPlugins: [
    "jest-watch-typeahead/filename",
    "jest-watch-typeahead/testname",
  ],
};
