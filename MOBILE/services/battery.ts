import { requireOptionalNativeModule } from 'expo-modules-core';

export const getDeviceBatteryLevel = async (): Promise<number> => {
  try {
    const ExpoBattery = requireOptionalNativeModule('ExpoBattery');
    if (ExpoBattery && typeof ExpoBattery.getBatteryLevelAsync === 'function') {
      const level = await ExpoBattery.getBatteryLevelAsync();
      if (typeof level === 'number' && level >= 0) {
        return Math.round(level * 100);
      }
    }
  } catch (e) {
    console.warn('ExpoBattery optional module check:', e);
  }
  return 100;
};
