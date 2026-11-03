import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Vercel's file tracer cannot see the Swagger UI assets because `@nestjs/swagger`
 * resolves their directory at runtime with `require('swagger-ui-dist/absolute-path.js')`.
 * The NestJS preset always bundles the `views` directory, so the assets are
 * copied there during the build and served with `customSwaggerUiPath`.
 */
const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(projectRoot, 'node_modules', 'swagger-ui-dist');
const targetDir = path.join(projectRoot, 'views', 'swagger-ui');

const assets = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'oauth2-redirect.html',
];

mkdirSync(targetDir, { recursive: true });

for (const asset of assets) {
  copyFileSync(path.join(sourceDir, asset), path.join(targetDir, asset));
}

console.log(
  `Copied ${assets.length} Swagger UI assets to ${path.relative(projectRoot, targetDir)}`,
);
