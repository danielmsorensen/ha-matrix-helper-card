// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    // Underscore-prefixed parameters are used throughout this codebase to
    // signal "required for the type signature, intentionally unused" (e.g.
    // a directive's render() must accept the same parameter shape as its
    // update() even when render() itself ignores it).
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
});
