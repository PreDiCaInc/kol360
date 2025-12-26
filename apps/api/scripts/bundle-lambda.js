const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function bundle() {
  const outdir = path.join(__dirname, '..', 'lambda-bundle');

  // Clean output directory
  if (fs.existsSync(outdir)) {
    fs.rmSync(outdir, { recursive: true });
  }
  fs.mkdirSync(outdir, { recursive: true });

  // Bundle with esbuild
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'dist', 'lambda.js')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: path.join(outdir, 'index.js'),
    external: [
      // Prisma requires these native modules
      '@prisma/client',
      '.prisma/client',
    ],
    minify: true,
    sourcemap: false,
  });

  // Copy Prisma client and engine
  // pnpm stores in node_modules/.pnpm
  const pnpmPrismaPath = path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm');

  // Create node_modules structure
  fs.mkdirSync(path.join(outdir, 'node_modules', '.prisma', 'client'), { recursive: true });
  fs.mkdirSync(path.join(outdir, 'node_modules', '@prisma', 'client'), { recursive: true });

  // Find and copy .prisma/client (generated)
  const prismaGeneratedDir = fs.readdirSync(pnpmPrismaPath).find(d => d.startsWith('@prisma+client'));
  if (prismaGeneratedDir) {
    const generatedClientPath = path.join(pnpmPrismaPath, prismaGeneratedDir, 'node_modules', '.prisma', 'client');
    if (fs.existsSync(generatedClientPath)) {
      execSync(`cp -r "${generatedClientPath}/"* "${outdir}/node_modules/.prisma/client/"`);
      console.log('Copied .prisma/client');
    }
  }

  // Copy @prisma/client
  const prismaClientDir = fs.readdirSync(pnpmPrismaPath).find(d => d.startsWith('@prisma+client'));
  if (prismaClientDir) {
    const clientPath = path.join(pnpmPrismaPath, prismaClientDir, 'node_modules', '@prisma', 'client');
    if (fs.existsSync(clientPath)) {
      execSync(`cp -r "${clientPath}/"* "${outdir}/node_modules/@prisma/client/"`);
      console.log('Copied @prisma/client');
    }
  }

  // Copy prisma schema
  const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
  fs.mkdirSync(path.join(outdir, 'prisma'), { recursive: true });
  fs.copyFileSync(schemaPath, path.join(outdir, 'prisma', 'schema.prisma'));

  // Create zip
  console.log('Creating lambda.zip...');
  execSync(`cd "${outdir}" && zip -rq ../lambda.zip .`);

  const zipPath = path.join(__dirname, '..', 'lambda.zip');
  const stats = fs.statSync(zipPath);
  console.log(`Created lambda.zip (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

bundle().catch(console.error);
