import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd(), "deployment_candidate_v1");
const sourceDir = path.join(rootDir, "frontend");
const outputDir = path.join(sourceDir, "dist");
const apiBaseUrl = (process.env.NETLIFY_API_BASE_URL || "").trim();

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
  if (entry.name === "dist" || entry.name === "config.template.js") {
    continue;
  }

  const sourcePath = path.join(sourceDir, entry.name);
  const targetPath = path.join(outputDir, entry.name);

  if (entry.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  } else {
    fs.copyFileSync(sourcePath, targetPath);
  }
}

const configTemplatePath = path.join(sourceDir, "config.template.js");
const configOutputPath = path.join(outputDir, "config.js");
const configTemplate = fs.readFileSync(configTemplatePath, "utf8");
const configContents = configTemplate.replace("__API_BASE_URL__", apiBaseUrl);

fs.writeFileSync(configOutputPath, configContents, "utf8");

console.log("Netlify frontend build completed.");
console.log("Output directory:", outputDir);
console.log("NETLIFY_API_BASE_URL:", apiBaseUrl || "(empty - frontend will fall back to same-host :8000)");
