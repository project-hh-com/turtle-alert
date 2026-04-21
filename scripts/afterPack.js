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
};
