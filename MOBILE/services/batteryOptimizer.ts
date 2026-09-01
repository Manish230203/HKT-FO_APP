import { Platform, Linking } from 'react-native';
import * as Application from 'expo-application';

/**
 * Trigger Android System Battery Optimization Bypass Dialog
 * "Allow PatrolSync FO to ignore battery optimizations?"
 */
export const requestIgnoreBatteryOptimizations = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  try {
    const IntentLauncher = require('expo-intent-launcher');
    const packageName = Application.applicationId;
    try {
      // 1. Launch direct package request dialog: Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
      await IntentLauncher.startActivityAsync(
        'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
        { data: `package:${packageName}` }
      );
      return true;
    } catch {
      // 2. Fallback to general Battery Optimization Settings screen
      await IntentLauncher.startActivityAsync(
        'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'
      );
      return true;
    }
  } catch (err) {
    console.warn('Error requesting ignore battery optimizations:', err);
    try {
      await Linking.openSettings();
    } catch {}
    return false;
  }
};

/**
 * 1-Tap OEM Auto-Start Settings Redirect
 * Support for Xiaomi (MIUI/HyperOS), Vivo (Funtouch/iQOO), Oppo/Realme (ColorOS/RealmeUI), Samsung (OneUI)
 */
export const openAutoStartSettings = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return false;

  const oemIntents = [
    // Xiaomi / Redmi / Poco (MIUI & HyperOS)
    { pkg: 'com.miui.securitycenter', cls: 'com.miui.permcenter.autostart.AutoStartManagementActivity' },
    // Vivo / iQOO
    { pkg: 'com.iqoo.secure', cls: 'com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity' },
    { pkg: 'com.vivo.permissionmanager', cls: 'com.vivo.permissionmanager.activity.BgStartUpManagerActivity' },
    // Oppo / Realme
    { pkg: 'com.coloros.safecenter', cls: 'com.coloros.safecenter.permission.startup.StartupAppListActivity' },
    { pkg: 'com.oppo.safe', cls: 'com.oppo.safe.permission.startup.StartupAppListActivity' },
    // Samsung (Device Care Battery Activity)
    { pkg: 'com.samsung.android.looper', cls: 'com.samsung.android.sm.ui.battery.BatteryActivity' },
    { pkg: 'com.samsung.android.sm', cls: 'com.samsung.android.sm.ui.battery.BatteryActivity' },
  ];

  try {
    const IntentLauncher = require('expo-intent-launcher');
    for (const intent of oemIntents) {
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
          packageName: intent.pkg,
          className: intent.cls,
        });
        return true;
      } catch {
        // Continue to next OEM intent
      }
    }
  } catch (err) {
    console.warn('IntentLauncher not available for OEM Auto-Start:', err);
  }

  // Fallback to standard app settings
  try {
    await Linking.openSettings();
  } catch {}
  return false;
};
