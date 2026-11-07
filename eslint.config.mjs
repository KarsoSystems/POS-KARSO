import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Atomic design: cada nivel solo importa de los niveles de abajo.
const HOOKS_DE_DATOS = [
  "use-auth",
  "use-productos",
  "use-banners",
  "use-sucursales",
  "use-demo-panel",
  "use-pedidos",
  "use-subir-archivo",
  "use-editor-item",
  "query-keys",
];

function soloNivelesDeAbajo(nivel, prohibidos, { hooksDeDatos = false } = {}) {
  const patterns = [
    ...prohibidos.map((n) => ({
      group: [`@/components/${n}/*`, `../${n}/*`],
      message: `${nivel}/ no puede importar de ${n}/ (atomic design).`,
    })),
    { group: ["@/server/*"], message: "Los componentes no importan nada de src/server." },
  ];
  if (hooksDeDatos) {
    patterns.push({
      group: HOOKS_DE_DATOS.map((h) => `@/hooks/${h}`),
      message: "Solo organisms/ y templates/ usan hooks de datos.",
    });
  }
  return {
    files: [`src/components/${nivel}/**`],
    rules: { "no-restricted-imports": ["error", { patterns }] },
  };
}

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  soloNivelesDeAbajo("atoms", ["molecules", "organisms", "templates"], { hooksDeDatos: true }),
  soloNivelesDeAbajo("molecules", ["organisms", "templates"], { hooksDeDatos: true }),
  soloNivelesDeAbajo("organisms", ["templates"]),
  soloNivelesDeAbajo("templates", []),
  // El front pide datos solo a través de los hooks de src/hooks (React Query).
  {
    files: ["src/components/**", "src/app/**/page.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: ["@/lib/auth-api", "@/lib/pedidos-api", "@/lib/tienda-api", "@/lib/demo-panel-api"].map((name) => ({
            name,
            allowTypeImports: true,
            message: "Pide los datos con los hooks de src/hooks (React Query), no con la API directamente.",
          })),
        },
      ],
    },
  },
];

export default eslintConfig;
