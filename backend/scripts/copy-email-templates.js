const fs = require("fs");
const path = require("path");

const sourceDir = path.join(__dirname, "..", "src", "templates");
const targetDir = path.join(__dirname, "..", "dist", "templates");

if (!fs.existsSync(sourceDir)) {
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const fileName of fs.readdirSync(sourceDir)) {
  if (!fileName.endsWith(".html")) continue;

  fs.copyFileSync(
    path.join(sourceDir, fileName),
    path.join(targetDir, fileName)
  );
}
