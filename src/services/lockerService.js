/**
 * LaundryGO - Smart Locker Hardware & API Bridge
 * 
 * Modul ini berfungsi sebagai pondasi integrasi antara Mobile Web LaundryGO
 * dengan Prototype Hardware Smart Locker (ESP32, Arduino, Raspberry Pi, dsb).
 * 
 * Protokol yang didukung:
 * 1. WebSocket (Real-time bidirectional control: ws://<locker_ip>:81/ws)
 * 2. HTTP REST API (Locker unlock, status query, tare/weighing)
 * 3. MQTT Broker (Pub/Sub untuk monitoring jarak jauh)
 * 4. Web Serial API (Direct USB connection to microcontroller)
 */

class LockerHardwareBridge {
  constructor() {
    this.isConnected = false;
    this.endpoint = null;
    this.ws = null;
    this.listeners = new Map();
    this.mockMode = true; // Default to interactive simulation if hardware not connected
    
    // Status awal locker prototype (SBH President University)
    this.lockers = {
      A01: { id: 'A01', status: 'READY FOR PICKUP', doorOpen: false, pinCode: '8910', sensor: 'UV_ACTIVE', weight: 3.5 },
      A02: { id: 'A02', status: 'AVAILABLE', doorOpen: false, pinCode: null, sensor: 'EMPTY', weight: 0 },
      A03: { id: 'A03', status: 'OCCUPIED', doorOpen: false, pinCode: '2411', sensor: 'OCCUPIED', weight: 4.2 },
      B01: { id: 'B01', status: 'AVAILABLE', doorOpen: false, pinCode: null, sensor: 'EMPTY', weight: 0 },
      B02: { id: 'B02', status: 'AVAILABLE', doorOpen: false, pinCode: null, sensor: 'EMPTY', weight: 0 },
      B03: { id: 'B03', status: 'MAINTENANCE', doorOpen: false, pinCode: null, sensor: 'UV_SANITIZING', weight: 0 },
    };
  }

  /**
   * Subscribe ke event locker (doorOpen, doorClose, statusChange, weightReading, qrScanned)
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter(cb => cb !== callback);
    this.listeners.set(event, filtered);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[LockerBridge] Error in listener for event ${event}:`, e);
        }
      });
    }
  }

  /**
   * Hubungkan ke prototype hardware melalui WebSocket (ESP32 / NodeMCU)
   * Contoh: bridge.connectWebSocket('ws://192.168.1.150:81/ws')
   */
  connectWebSocket(url) {
    this.endpoint = url;
    console.log(`[LockerBridge] Connecting to Hardware Locker at ${url}...`);
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.isConnected = true;
        this.mockMode = false;
        console.log('[LockerBridge] Connected to Smart Locker Hardware Prototype!');
        this.emit('connectionChange', { connected: true, endpoint: url });
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleHardwareMessage(payload);
        } catch (err) {
          console.warn('[LockerBridge] Raw message from hardware:', event.data);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.mockMode = true;
        console.log('[LockerBridge] Hardware connection closed. Reverting to interactive simulation.');
        this.emit('connectionChange', { connected: false });
      };

      this.ws.onerror = (err) => {
        console.error('[LockerBridge] WebSocket Error:', err);
        this.emit('error', err);
      };
    } catch (e) {
      console.warn('[LockerBridge] Unable to create WebSocket. Running in standalone UI mode.', e);
    }
  }

  /**
   * Parsing data masuk dari mikrokontroler ESP32 / Arduino
   */
  handleHardwareMessage(payload) {
    // Format JSON dari hardware contoh:
    // { "type": "DOOR_TRIGGERED", "lockerId": "A01", "state": "OPEN" }
    // { "type": "LOAD_CELL_WEIGHT", "lockerId": "A01", "weightKg": 3.48 }
    // { "type": "OPTICAL_SCANNER_READ", "qrRaw": "LGO-SEC-3942-F8B1" }
    console.log('[LockerBridge] Hardware event received:', payload);
    switch (payload.type) {
      case 'DOOR_TRIGGERED':
        if (this.lockers[payload.lockerId]) {
          this.lockers[payload.lockerId].doorOpen = payload.state === 'OPEN';
        }
        this.emit('doorChange', payload);
        break;
      case 'LOAD_CELL_WEIGHT':
        this.emit('weightReading', payload);
        break;
      case 'OPTICAL_SCANNER_READ':
        this.emit('qrScanned', payload);
        break;
      default:
        this.emit('hardwareMessage', payload);
    }
  }

  /**
   * Kirim perintah BUKA PINTU SOLENOID ke locker
   * Mendukung koneksi hardware nyata atau simulasi instan
   */
  async unlockLocker(lockerId, authPayload = {}) {
    console.log(`[LockerBridge] Requesting UNLOCK for Locker ${lockerId}...`, authPayload);

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const command = {
        action: 'UNLOCK',
        lockerId: lockerId,
        timestamp: Date.now(),
        auth: authPayload
      };
      this.ws.send(JSON.stringify(command));
    }

    // Update internal state
    if (this.lockers[lockerId]) {
      this.lockers[lockerId].doorOpen = true;
    }

    this.emit('doorChange', { lockerId, state: 'OPEN', by: authPayload.role || 'user' });

    return {
      success: true,
      lockerId,
      unlockedAt: new Date().toISOString(),
      message: `Locker ${lockerId} solenoid triggered successfully.`
    };
  }

  /**
   * Perintah KUNCI PINTU SOLENOID
   */
  async lockLocker(lockerId) {
    console.log(`[LockerBridge] Locking Locker ${lockerId}...`);

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'LOCK', lockerId, timestamp: Date.now() }));
    }

    if (this.lockers[lockerId]) {
      this.lockers[lockerId].doorOpen = false;
    }

    this.emit('doorChange', { lockerId, state: 'CLOSED' });
    return { success: true, lockerId };
  }

  /**
   * Verifikasi Optical Token QR dari Scanner Hardware
   */
  verifyQRToken(scannedToken, targetLockerId = 'A01') {
    if (!scannedToken) return { valid: false, reason: 'Token kosong' };
    
    // Verifikasi format token LaundryGO (LGO-SEC-xxxx atau OTP)
    const isValidFormat = scannedToken.startsWith('LGO-') || scannedToken.length >= 8;
    
    return {
      valid: isValidFormat,
      lockerId: targetLockerId,
      verifiedAt: new Date().toISOString(),
      token: scannedToken
    };
  }
}

// Inisialisasi singleton bridge global
const lockerBridge = new LockerHardwareBridge();
if (typeof window !== 'undefined') {
  window.LaundryGOHardwareBridge = lockerBridge;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LockerHardwareBridge, lockerBridge };
}
