import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 빌드 대상 아닌 스크립트/테스트/Edge Functions 제외
    // (Vercel `next build` lint 범위 밖, 별도 런타임)
    "scripts/**",
    "e2e/**",
    "supabase/functions/**",
    "apply-storage-migration.js",
    "apply_migration.js",
    "apply_migration_060.js",
    "check_migration.js",
    "create-bucket.js",
    "execute_migration.js",
    "fix-rls-policy.js",
    "run_migration.js",
    "run_migration_060.js",
    "test_connection.js",
  ]),
  // 새로 도입된 React Hooks strict rule은 경고로 완화
  // (기존 코드 패턴 대량 영향, 점진적 리팩터링 예정)
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/component-hook-factories": "warn",
    },
  },
]);

export default eslintConfig;
