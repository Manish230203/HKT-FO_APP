import * as Battery from 'expo-battery';

export const getDeviceBatteryLevel = async (): Promise<number> => {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (typeof level === 'number' && level >= 0) {
      return Math.round(level * 100);
    }
  } catch (e) {
    console.warn('ExpoBattery level check:', e);
  }
  return 100;
};
