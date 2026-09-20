const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const targets = process.argv[2] ? [process.argv[2]] : ['chrome', 'firefox'];

for (const target of targets) {
  const targetDir = path.join(distDir, target);
  const zipFile = path.join(rootDir, `${target}-extension.zip`);

  if (!fs.existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}. Please run build first.`);
    process.exit(1);
  }

  // Remove existing zip if present
  if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
  }

  console.log(`Packaging ${target} extension...`);

  try {
    // Check if zip command is available
    execSync(`cd "${targetDir}" && zip -r -D "${zipFile}" .`, { stdio: 'inherit' });
    console.log(`Created ${target}-extension.zip successfully!`);
  } catch (err) {
    console.error(`Failed to package ${target}:`, err);
    process.exit(1);
  }
}
