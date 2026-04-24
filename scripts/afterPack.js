const fs = require("fs");
const path = require("path");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

module.exports = async function afterPack(context) {
  const appPath =
    context.appOutDir +
    "/" +
    context.packager.appInfo.productFilename +
    ".app";

  await flipFuses(appPath, {
    version: FuseVersion.V1,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: false,
  });

  console.log(`[afterPack] Fuses flipped for: ${appPath}`);

  // .lproj 디렉토리를 .app 번들의 Resources로 복사 (Finder 한글 이름 표시용)
  const resourcesDir = path.join(appPath, "Contents", "Resources");
  const buildDir = path.join(__dirname, "..", "build");
  for (const entry of fs.readdirSync(buildDir)) {
    if (entry.endsWith(".lproj")) {
      const src = path.join(buildDir, entry);
      const dest = path.join(resourcesDir, entry);
      fs.cpSync(src, dest, { recursive: true });
      console.log(`[afterPack] Copied ${entry} to Resources`);
    }
  }
};
