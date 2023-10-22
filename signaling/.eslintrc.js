module.exports = {
  root: true,
  parser: "vue-eslint-parser",
  parserOptions: {
    parser: "@typescript-eslint/parser",
  },
  plugins: ["@typescript-eslint", "prettier", "jest"],
  extends: [
    "eslint:recommended",
    "plugin:vue/vue3-essential",
    "plugin:prettier/recommended",
  ],
  ignorePatterns: [
    "node_modules/**/*",
    "webapp/dist/**/*",
    "webapp/vendor/**/*",
    "doc/**/*",
    "lib/**/*",
  ],
  rules: {
    curly: "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_[\\w]+$", // Allow underscore prefixed word characters
      },
    ],
    // For non-ts
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_[\\w]+$", // Allow underscore prefixed word characters
      },
    ],
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-array-constructor": "off",
    "no-restricted-globals": [
      "error",
      {
        name: "clearInterval",
        message: "Avoid using setInterval.",
      },
      {
        name: "setInterval",
        message: "Avoid using setInterval.",
      },
    ],
    "no-restricted-properties": [
      "error",
      {
        object: "window",
        property: "clearInterval",
        message: "Avoid using setInterval.",
      },
      {
        object: "window",
        property: "setInterval",
        message: "Avoid using setInterval.",
      },
    ],
    "prettier/prettier": [
      "error",
      {
        endOfLine: "auto",
      },
    ],
  },
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
    BABYLON: "readonly",
    cloudinary: "writeable",
    localize: "readonly",
    gapi: "readonly",
    page: true,
  },
  env: {
    node: true,
    browser: true,
    jest: true,
  },
  overrides: [
    {
      files: ["*/**/*.ts"],
      extends: ["plugin:@typescript-eslint/recommended"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-var-requires": "off",
      },
    },
    {
      // where typescript is already handling undefined checks,
      // disable redundant eslint check that doesn't consider global.d.ts
      // https://stackoverflow.com/a/70371246
      files: ["*.ts", "*.vue"],
      rules: {
        "no-undef": 0,
        "vue/multi-word-component-names": 0,
        "vue/no-v-text-v-html-on-component": 0,
      },
    },
  ],
};
