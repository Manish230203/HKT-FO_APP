export const getDeviceBatteryLevel = async (): Promise<number> => {
  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      const battery: any = await (navigator as any).getBattery();
      if (battery && typeof battery.level === 'number') {
        return Math.round(battery.level * 100);
      }
    }
  } catch (e) {
    console.warn('Error reading web battery level:', e);
  }
  return 100;
};
