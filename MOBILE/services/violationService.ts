import api from './api';
import { setStorageItem, getStorageItem, deleteStorageItem, getUserSession } from './db';

const VIOLATION_STATE_KEY = 'fo_location_violation_state'; // 'ON' | 'OFF'
const PUNCH_IN_ID_KEY = 'fo_active_punch_in_id';
const VIOLATION_QUEUE_KEY = 'fo_violation_queue';

export interface QueuedViolationEvent {
  id: string;
  eventType: 'LOCATION_OFF' | 'LOCATION_RESTORED' | 'PUNCH_OUT_CLOSE';
  employeeOid: number;
  punchInId: number | string | null;
  timestamp: string;
  details?: string;
  createdTime: number;
}

class ViolationService {
  private isProcessingQueue = false;

  // Persist active punch_in_id when officer punches in
  public async setPunchInId(punchInId: number | string | null) {
    if (punchInId) {
      await setStorageItem(PUNCH_IN_ID_KEY, String(punchInId));
    } else {
      await deleteStorageItem(PUNCH_IN_ID_KEY);
    }
  }

  // Retrieve stored punch_in_id
  public async getPunchInId(): Promise<number | string | null> {
    try {
      const val = await getStorageItem(PUNCH_IN_ID_KEY);
      return val ? (isNaN(Number(val)) ? val : Number(val)) : null;
    } catch {
      return null;
    }
  }

  // Get current location state ('ON' or 'OFF')
  public async getViolationState(): Promise<'ON' | 'OFF'> {
    try {
      const state = await getStorageItem(VIOLATION_STATE_KEY);
      return state === 'OFF' ? 'OFF' : 'ON';
    } catch {
      return 'ON';
    }
  }

  // Save location state ('ON' or 'OFF')
  private async setViolationState(state: 'ON' | 'OFF') {
    await setStorageItem(VIOLATION_STATE_KEY, state);
  }

  // Handle Location Provider ON/OFF state transition
  public async handleLocationStateChange(
    isLocationOn: boolean,
    isOnDuty: boolean,
    employeeOid: number,
    punchInId?: number | string | null
  ) {
    if (!isOnDuty || !employeeOid) {
      if (isLocationOn) {
        await this.setViolationState('ON');
      }
      return;
    }

    const currentState = await this.getViolationState();
    const activePunchInId = punchInId || (await this.getPunchInId());
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // ON -> OFF transition
    if (!isLocationOn && currentState === 'ON') {
      console.log(`[ViolationService] Location ON -> OFF transition detected for Officer #${employeeOid}`);
      await this.setViolationState('OFF');
      await this.reportLocationOff(employeeOid, activePunchInId, nowIso);
    }
    // OFF -> ON transition
    else if (isLocationOn && currentState === 'OFF') {
      console.log(`[ViolationService] Location OFF -> ON transition detected for Officer #${employeeOid}`);
      await this.setViolationState('ON');
      await this.reportLocationRestored(employeeOid, activePunchInId, nowIso);
    }
  }

  // Send or queue Location OFF event
  public async reportLocationOff(employeeOid: number, punchInId: number | string | null, timestamp: string) {
    const payload = {
      employee_oid: employeeOid,
      employee_id: employeeOid,
      location_off_at: timestamp,
      timestamp: timestamp,
      punch_in_id: punchInId ? Number(punchInId) || punchInId : null,
      event_type: 'DUTY_LOCATION_OFF_VIOLATION',
      details: 'Field officer turned off Location (GPS) during active duty shift',
    };

    try {
      // Try production endpoint first, fallback to legacy route
      try {
        await api.post('/v1/violations/location-off', payload);
      } catch (err: any) {
        if (err.response && (err.response.status === 404 || err.response.status === 405)) {
          await api.post('/attendance/location-violation', payload);
        } else {
          throw err;
        }
      }
      console.log('[ViolationService] Location OFF event sent successfully');
    } catch (err) {
      console.warn('[ViolationService] Location OFF network failure. Queueing offline event...', err);
      await this.enqueueEvent({
        id: `off_${Date.now()}`,
        eventType: 'LOCATION_OFF',
        employeeOid,
        punchInId,
        timestamp,
        details: payload.details,
        createdTime: Date.now(),
      });
    }
  }

  // Send or queue Location RESTORED event
  public async reportLocationRestored(employeeOid: number, punchInId: number | string | null, timestamp: string) {
    const payload = {
      employee_oid: employeeOid,
      employee_id: employeeOid,
      location_restored_at: timestamp,
      timestamp: timestamp,
      punch_in_id: punchInId ? Number(punchInId) || punchInId : null,
      event_type: 'DUTY_LOCATION_RESTORED',
      details: 'Field officer turned Location (GPS) back ON during active duty shift',
    };

    try {
      try {
        await api.post('/v1/violations/location-restored', payload);
      } catch (err: any) {
        if (err.response && (err.response.status === 404 || err.response.status === 405)) {
          await api.post('/attendance/location-violation', payload);
        } else {
          throw err;
        }
      }
      console.log('[ViolationService] Location RESTORED event sent successfully');
    } catch (err) {
      console.warn('[ViolationService] Location RESTORED network failure. Queueing offline event...', err);
      await this.enqueueEvent({
        id: `restored_${Date.now()}`,
        eventType: 'LOCATION_RESTORED',
        employeeOid,
        punchInId,
        timestamp,
        details: payload.details,
        createdTime: Date.now(),
      });
    }
  }

  // Send or queue Punch Out Close event when officer punches out
  public async handlePunchOut(employeeOid: number, punchInId: number | string | null, timestamp: string) {
    const currentState = await this.getViolationState();
    const activePunchInId = punchInId || (await this.getPunchInId());

    // Reset state & stored punchInId
    await this.setViolationState('ON');
    await this.setPunchInId(null);

    // If a violation was open at Punch Out, send punch-out-close event
    if (currentState === 'OFF') {
      const payload = {
        employee_oid: employeeOid,
        punch_in_id: activePunchInId ? Number(activePunchInId) || activePunchInId : null,
        punch_out_id: activePunchInId ? Number(activePunchInId) || activePunchInId : null,
        punch_out_time: timestamp,
      };

      try {
        try {
          await api.post('/v1/violations/punch-out-close', payload);
        } catch (err: any) {
          if (err.response && (err.response.status === 404 || err.response.status === 405)) {
            await api.post('/attendance/location-violation', {
              ...payload,
              event_type: 'DUTY_LOCATION_PUNCH_OUT_CLOSE',
              details: 'Shift ended while location was OFF',
            });
          } else {
            throw err;
          }
        }
        console.log('[ViolationService] Punch Out Close violation event sent successfully');
      } catch (err) {
        console.warn('[ViolationService] Punch Out Close network failure. Queueing offline event...', err);
        await this.enqueueEvent({
          id: `close_${Date.now()}`,
          eventType: 'PUNCH_OUT_CLOSE',
          employeeOid,
          punchInId: activePunchInId,
          timestamp,
          details: 'Shift ended while location was OFF',
          createdTime: Date.now(),
        });
      }
    }

    // Flush any pending queued events after network returns
    this.flushQueue().catch(() => {});
  }

  // Enqueue offline violation event
  private async enqueueEvent(event: QueuedViolationEvent) {
    try {
      const queue = await this.getQueue();
      queue.push(event);
      // Ensure chronological ordering by createdTime
      queue.sort((a, b) => a.createdTime - b.createdTime);
      await setStorageItem(VIOLATION_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('[ViolationService] Enqueue event failed:', e);
    }
  }

  // Get current offline queue
  private async getQueue(): Promise<QueuedViolationEvent[]> {
    try {
      const val = await getStorageItem(VIOLATION_QUEUE_KEY);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  // Flush offline queue in strict chronological order
  public async flushQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      const queue = await this.getQueue();
      if (queue.length === 0) {
        this.isProcessingQueue = false;
        return;
      }

      console.log(`[ViolationService] Flushing ${queue.length} offline violation event(s) in order...`);
      const remaining: QueuedViolationEvent[] = [];

      for (const item of queue) {
        try {
          if (item.eventType === 'LOCATION_OFF') {
            await this.reportLocationOff(item.employeeOid, item.punchInId, item.timestamp);
          } else if (item.eventType === 'LOCATION_RESTORED') {
            await this.reportLocationRestored(item.employeeOid, item.punchInId, item.timestamp);
          } else if (item.eventType === 'PUNCH_OUT_CLOSE') {
            await this.handlePunchOut(item.employeeOid, item.punchInId, item.timestamp);
          }
        } catch {
          remaining.push(item);
        }
      }

      await setStorageItem(VIOLATION_QUEUE_KEY, JSON.stringify(remaining));
    } catch (e) {
      console.error('[ViolationService] Flush queue error:', e);
    } finally {
      this.isProcessingQueue = false;
    }
  }
}

export const violationService = new ViolationService();
