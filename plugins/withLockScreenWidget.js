const fs = require('fs');
const path = require('path');
const {
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
  IOSConfig,
} = require('@expo/config-plugins');

const APP_GROUP_ID = 'group.com.naor823.WorldSports';
const WIDGET_NAME = 'WorldSportsLockWidget';
const WIDGET_BUNDLE_SUFFIX = 'LockWidget';

function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    const existingGroups = Array.isArray(mod.modResults['com.apple.security.application-groups'])
      ? mod.modResults['com.apple.security.application-groups']
      : [];
    if (!existingGroups.includes(APP_GROUP_ID)) {
      mod.modResults['com.apple.security.application-groups'] = [...existingGroups, APP_GROUP_ID];
    }
    return mod;
  });
}

function withCopyWidgetSwiftFile(config) {
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const sourceSwift = path.join(projectRoot, 'widgets', 'ios', `${WIDGET_NAME}.swift`);
      const targetDir = path.join(mod.modRequest.platformProjectRoot, WIDGET_NAME);
      const targetSwift = path.join(targetDir, `${WIDGET_NAME}.swift`);

      if (!fs.existsSync(sourceSwift)) {
        throw new Error(`Missing Swift widget source file at: ${sourceSwift}`);
      }

      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(sourceSwift, targetSwift);
      return mod;
    },
  ]);
}

function withWidgetExtensionTarget(config) {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const targetName = WIDGET_NAME;

    if (xcodeProject.pbxTargetByName(targetName)) {
      return mod;
    }

    const mainBundleId = mod.ios?.bundleIdentifier || 'com.naor823.WorldSports';
    const widgetBundleId = `${mainBundleId}.${WIDGET_BUNDLE_SUFFIX}`;
    const deploymentTarget = mod.ios?.deploymentTarget || '16.0';

    const swiftFileName = `${WIDGET_NAME}.swift`;
    const widgetGroup = xcodeProject.addPbxGroup([swiftFileName], targetName, targetName);

    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(widgetGroup.uuid, mainGroupKey);

    const target = xcodeProject.addTarget(
      targetName,
      'app_extension',
      targetName,
      widgetBundleId
    );

    if (target?.uuid) {
      xcodeProject.addBuildPhase(
        [swiftFileName],
        'PBXSourcesBuildPhase',
        'Sources',
        target.uuid,
        'app_extension',
        targetName
      );
      xcodeProject.addBuildPhase(
        [],
        'PBXFrameworksBuildPhase',
        'Frameworks',
        target.uuid,
        'app_extension',
        targetName
      );
      xcodeProject.addBuildPhase(
        [],
        'PBXResourcesBuildPhase',
        'Resources',
        target.uuid,
        'app_extension',
        targetName
      );
    }

    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    Object.keys(configurations).forEach((key) => {
      const item = configurations[key];
      if (!item || !item.buildSettings) return;
      if (item.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === widgetBundleId) {
        item.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
        item.buildSettings.SWIFT_VERSION = '5.0';
        item.buildSettings.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
        item.buildSettings.TARGETED_DEVICE_FAMILY = '"1"';
        item.buildSettings.SKIP_INSTALL = 'YES';
        item.buildSettings.APPLICATION_EXTENSION_API_ONLY = 'YES';
      }
    });

    const entitlementsPath = path.join(
      mod.modRequest.platformProjectRoot,
      targetName,
      `${targetName}.entitlements`
    );
    fs.mkdirSync(path.dirname(entitlementsPath), { recursive: true });
    const entitlementsXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP_ID}</string>
  </array>
</dict>
</plist>
`;
    fs.writeFileSync(entitlementsPath, entitlementsXml, 'utf8');

    const mainTarget = xcodeProject.getFirstTarget()?.uuid;
    if (mainTarget && target?.uuid) {
      xcodeProject.addTargetDependency(mainTarget, [target.uuid]);
    }

    return mod;
  });
}

module.exports = function withLockScreenWidget(config) {
  config = withAppGroupEntitlement(config);
  config = withCopyWidgetSwiftFile(config);
  config = withWidgetExtensionTarget(config);
  return config;
};