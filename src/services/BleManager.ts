import { PermissionsAndroid, Platform } from 'react-native';
import type { AccelerationSample, GyroscopeSample, SensorMotionSample } from './ImpactService';
import type { BleError, BleManager, Device } from 'react-native-ble-plx';

export const SENSOR_DEVICE_NAME = 'SnowShield-Sensor';

// Replace these example UUIDs with the values implemented by the sensor firmware.
export const SENSOR_SERVICE_UUID = '8e7f0001-5f2a-4d9b-a4e8-4c774e102001';
export const SENSOR_MOTION_CHARACTERISTIC_UUID = '8e7f0002-5f2a-4d9b-a4e8-4c774e102001';

export type AccelerationWireUnit = 'g' | 'm/s²';
export type GyroscopeWireUnit = 'rad/s' | 'deg/s';

export interface SensorPayloadOptions {
  accelerationUnit?: AccelerationWireUnit;
  gyroscopeUnit?: GyroscopeWireUnit;
}

export interface BleManagerCallbacks {
  onConnectionStatus: (status: 'Disconnected' | 'Scanning' | 'Connected') => void;
  onDeviceName: (name: string | null) => void;
  onReading: (reading: SensorMotionSample) => void;
  onError: (message: string) => void;
}

const STANDARD_GRAVITY = 9.80665;
const SCAN_WINDOW_MS = 12_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 20_000;
const PAYLOAD_BYTE_LENGTH = 6 * Float32Array.BYTES_PER_ELEMENT;

/**
 * Expected GATT payload: 6 little-endian IEEE-754 Float32 values in this order:
 * ax, ay, az (m/s²), gx, gy, gz (rad/s). Configure units if firmware uses alternatives.
 */
export function decodeMotionPayload(
  base64Value: string,
  options: SensorPayloadOptions = {},
  timestamp = Date.now(),
): SensorMotionSample {
  const bytes = decodeBase64(base64Value);
  if (bytes.byteLength !== PAYLOAD_BYTE_LENGTH) {
    throw new Error(`Expected a ${PAYLOAD_BYTE_LENGTH}-byte motion packet, received ${bytes.byteLength} bytes.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = Array.from({ length: 6 }, (_, index) => view.getFloat32(index * 4, true));
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Motion packet contains a non-finite value.');
  }

  const accelerationUnit = options.accelerationUnit ?? 'm/s²';
  const scaleToG = accelerationUnit === 'g' ? 1 : 1 / STANDARD_GRAVITY;
  const acceleration: AccelerationSample = {
    x: values[0] * scaleToG,
    y: values[1] * scaleToG,
    z: values[2] * scaleToG,
    unit: 'g',
    timestamp,
  };

  const gyroscopeWireUnit = options.gyroscopeUnit ?? 'rad/s';
  const scaleToRadians = gyroscopeWireUnit === 'deg/s' ? Math.PI / 180 : 1;
  const gyroscope: GyroscopeSample = {
    x: values[3] * scaleToRadians,
    y: values[4] * scaleToRadians,
    z: values[5] * scaleToRadians,
    unit: 'rad/s',
    timestamp,
  };

  return { acceleration, gyroscope, timestamp };
}

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of value.replace(/\s/g, '')) {
    if (character === '=') break;
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('The GATT value is not valid Base64.');
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

async function requestBlePermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const apiLevel = Number(Platform.Version);
  const permissions = PermissionsAndroid.PERMISSIONS;
  const required = apiLevel >= 31
    ? [permissions.BLUETOOTH_SCAN, permissions.BLUETOOTH_CONNECT, permissions.ACCESS_FINE_LOCATION]
    : [permissions.ACCESS_FINE_LOCATION];
  const requestable = required;
  const result = await PermissionsAndroid.requestMultiple(requestable);
  const denied = requestable.filter((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied.length > 0) {
    throw new Error('Bluetooth scan permission was denied. Allow nearby-device and location permissions to connect the sensor.');
  }
}

export class BleManagerService {
  private manager: BleManager | null = null;
  private callbacks: BleManagerCallbacks | null = null;
  private monitorSubscription: { remove: () => void } | null = null;
  private disconnectSubscription: { remove: () => void } | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldRun = false;
  private generation = 0;
  private reconnectAttempt = 0;
  private activeDevice: Device | null = null;
  private pendingDeviceId: string | null = null;
  private connecting = false;
  private cancelStateWait: (() => void) | null = null;

  async start(callbacks: BleManagerCallbacks, payloadOptions: SensorPayloadOptions = {}): Promise<void> {
    if (Platform.OS === 'web') {
      throw new Error('Bluetooth LE is available only in an iOS or Android development build.');
    }
    if (this.shouldRun) return;

    this.callbacks = callbacks;
    this.shouldRun = true;
    const generation = ++this.generation;
    this.reconnectAttempt = 0;
    callbacks.onDeviceName(null);
    try {
      await requestBlePermissions();
      if (!this.shouldRun || generation !== this.generation) return;

      const manager = await this.getOrCreateManager();
      if (!this.shouldRun || generation !== this.generation) return;
      const isPoweredOn = await this.waitForPoweredOn(manager);
      if (!this.shouldRun || generation !== this.generation) return;
      if (!isPoweredOn) {
        throw new Error('Bluetooth is off or unavailable. Turn on Bluetooth and try again.');
      }

      void this.scanForSensor(generation, payloadOptions);
    } catch (error) {
      if (!this.shouldRun || generation !== this.generation) return;
      this.shouldRun = false;
      callbacks.onConnectionStatus('Disconnected');
      throw error;
    }
  }

  async stop(): Promise<void> {
    const deviceId = this.activeDevice?.id ?? this.pendingDeviceId;
    this.shouldRun = false;
    this.generation += 1;
    this.cancelStateWait?.();
    this.cancelStateWait = null;
    this.clearTimers();
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.activeDevice = null;
    this.pendingDeviceId = null;
    this.connecting = false;
    this.callbacks?.onDeviceName(null);

    const manager = this.manager;
    if (manager) {
      try {
        await manager.stopDeviceScan();
      } catch {
        // A scan can finish itself when the adapter changes state.
      }
      if (deviceId) {
        try {
          await manager.cancelDeviceConnection(deviceId);
        } catch {
          // It may already have disconnected.
        }
      }
    }
    this.callbacks?.onConnectionStatus('Disconnected');
  }

  async destroy(): Promise<void> {
    this.callbacks = null;
    await this.stop();
    if (this.manager) {
      try {
        await this.manager.destroy();
      } finally {
        this.manager = null;
      }
    }
    this.callbacks = null;
  }

  private async getOrCreateManager(): Promise<BleManager> {
    if (!this.manager) {
      const { BleManager: NativeBleManager } = await import('react-native-ble-plx');
      this.manager = new NativeBleManager();
    }
    return this.manager;
  }

  private async waitForPoweredOn(manager: BleManager): Promise<boolean> {
    const currentState = await manager.state();
    if (currentState === 'PoweredOn') return true;
    if (currentState === 'PoweredOff' || currentState === 'Unsupported' || currentState === 'Unauthorized') return false;

    return new Promise<boolean>((resolve) => {
      let finished = false;
      let subscription: { remove: () => void } | null = null;
      const finish = (poweredOn: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        subscription?.remove();
        this.cancelStateWait = null;
        resolve(poweredOn);
      };
      this.cancelStateWait = () => finish(false);
      const timeout = setTimeout(() => finish(false), 10_000);
      subscription = manager.onStateChange((state) => {
        if (state === 'PoweredOn') finish(true);
        if (state === 'PoweredOff' || state === 'Unsupported' || state === 'Unauthorized') finish(false);
      }, true);
      if (finished) subscription.remove();
    });
  }

  private async scanForSensor(generation: number, payloadOptions: SensorPayloadOptions): Promise<void> {
    if (!this.shouldRun || generation !== this.generation || this.connecting) return;
    const manager = await this.getOrCreateManager();
    this.callbacks?.onConnectionStatus('Scanning');

    try {
      await manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (!this.shouldRun || generation !== this.generation) return;
        if (error) {
          this.callbacks?.onError(error.message || 'Bluetooth scan failed.');
          void this.scheduleReconnect(generation, payloadOptions);
          return;
        }
        const advertisedName = device?.name ?? device?.localName;
        if (!device || advertisedName !== SENSOR_DEVICE_NAME) return;

        this.clearScanTimer();
        void manager.stopDeviceScan();
        void this.connectToSensor(device, generation, payloadOptions);
      });
      this.scanTimer = setTimeout(() => {
        if (!this.shouldRun || generation !== this.generation || this.connecting) return;
        this.clearScanTimer();
        void manager.stopDeviceScan();
        void this.scheduleReconnect(generation, payloadOptions);
      }, SCAN_WINDOW_MS);
    } catch (error) {
      if (!this.shouldRun || generation !== this.generation) return;
      this.callbacks?.onError(errorMessage(error, 'Unable to start Bluetooth scan.'));
      await this.scheduleReconnect(generation, payloadOptions);
    }
  }

  private async connectToSensor(
    scannedDevice: Device,
    generation: number,
    payloadOptions: SensorPayloadOptions,
  ): Promise<void> {
    const manager = this.manager;
    if (!manager || this.connecting || !this.shouldRun || generation !== this.generation) return;
    this.connecting = true;
    this.pendingDeviceId = scannedDevice.id;
    this.clearScanTimer();

    try {
      const device = await manager.connectToDevice(scannedDevice.id, { timeout: 12_000 });
      if (!this.shouldRun || generation !== this.generation) {
        await manager.cancelDeviceConnection(device.id);
        return;
      }
      this.activeDevice = device;
      this.callbacks?.onDeviceName(device.name ?? device.localName ?? SENSOR_DEVICE_NAME);
      this.disconnectSubscription = manager.onDeviceDisconnected(device.id, (error) => {
        if (error) this.callbacks?.onError(error.message || 'Sensor connection dropped.');
        void this.scheduleReconnect(generation, payloadOptions);
      });

      await manager.discoverAllServicesAndCharacteristicsForDevice(device.id);
      if (!this.shouldRun || generation !== this.generation) return;

      this.monitorSubscription = manager.monitorCharacteristicForDevice(
        device.id,
        SENSOR_SERVICE_UUID,
        SENSOR_MOTION_CHARACTERISTIC_UUID,
        (error: BleError | null, characteristic) => {
          if (!this.shouldRun || generation !== this.generation) return;
          if (error) {
            this.callbacks?.onError(error.message || 'Sensor telemetry stream disconnected.');
            void this.scheduleReconnect(generation, payloadOptions);
            return;
          }
          if (!characteristic?.value) return;
          try {
            const reading = decodeMotionPayload(characteristic.value, payloadOptions);
            this.callbacks?.onReading(reading);
          } catch (parseError) {
            this.callbacks?.onError(errorMessage(parseError, 'Unable to parse sensor packet.'));
          }
        },
      );

      this.reconnectAttempt = 0;
      this.callbacks?.onConnectionStatus('Connected');
    } catch (error) {
      if (this.shouldRun && generation === this.generation) {
        this.callbacks?.onError(errorMessage(error, 'Could not connect to the sensor.'));
      }
      await this.scheduleReconnect(generation, payloadOptions);
    } finally {
      this.pendingDeviceId = null;
      this.connecting = false;
    }
  }

  private async scheduleReconnect(generation: number, payloadOptions: SensorPayloadOptions): Promise<void> {
    if (!this.shouldRun || generation !== this.generation || this.reconnectTimer) return;
    this.clearScanTimer();
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    const deviceId = this.activeDevice?.id ?? this.pendingDeviceId;
    this.activeDevice = null;
    this.pendingDeviceId = null;
    this.connecting = false;
    this.callbacks?.onDeviceName(null);
    this.callbacks?.onConnectionStatus('Disconnected');

    if (deviceId && this.manager) {
      try {
        await this.manager.cancelDeviceConnection(deviceId);
      } catch {
        // A dropped link may already have been cancelled by the platform.
      }
    }

    if (!this.shouldRun || generation !== this.generation) return;

    const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * (2 ** this.reconnectAttempt), MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.scanForSensor(generation, payloadOptions);
    }, delay);
  }

  private clearScanTimer(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
  }

  private clearTimers(): void {
    this.clearScanTimer();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
