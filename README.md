# Summit Sentinel

An offline-first Expo + React Native TypeScript starter for a snow-sports concussion monitor. The app includes a sensor dashboard, shared telemetry state, a local SQLite Medical ID and emergency-contact manager, a simulated telemetry log, and a foreground BLE scan/connect flow. It does **not** provide medical diagnosis.

## Requirements

- Node.js 22.13 or newer (required by Expo SDK 57)
- npm
- A physical iOS or Android device with Bluetooth LE for hardware testing

## Run locally

1. Install dependencies: `npm install`
2. Check TypeScript: `npm run typecheck`
3. Build/install the native development client: `npm run run:ios -- --device` or `npm run run:android -- --device`
4. Start Metro: `npm start`, then open the installed Summit Sentinel development build.

`react-native-ble-plx` contains native code and does not work in Expo Go. Rebuild the development client after changing native dependencies or BLE plugin configuration. A simulator can run the app UI but will not connect to the physical SnowShield sensor.

To build with EAS, run `./build.sh ios development`, `./build.sh ios development-simulator`, `./build.sh android preview`, or `./build.sh android production`. The script checks Node.js, installs dependencies if needed, runs the TypeScript check, and starts the selected EAS build. Sign in to EAS and link the project with `eas init` before the first build.

The Expo Router entry is `app/`. `SensorProvider` and `SQLiteProvider` are mounted at the root. SQLite creates and migrates `summit-sentinel.db` on first launch. Rider profile fields and emergency contacts can be edited in the **Medical ID** tab; the **Medical Pass** button stays available above the tab bar from every screen. The mock mode is enabled initially so the telemetry controls are ready to try; events are marked as simulated.

## Impact response

`ImpactService` computes acceleration magnitude from the incoming XYZ vector and converts SI acceleration to g when needed. The BLE notification handler passes decoded motion samples into `SensorContext`, which invokes the impact detector on each sample. A threshold crossing above 50g opens the full-screen response countdown; a 65g simulator event exercises the same path. After 45 seconds, the app attempts to load the last known foreground location and opens the native SMS composer with the rider name, peak g-force, coordinates, and altitude. The user still has to review and send that message.

This workspace uses Expo SDK 57. `expo-av` was deprecated and removed starting in SDK 55, so the alarm uses its supported replacement, `expo-audio`; the one-second WAV alarm cadence is generated locally, played at maximum app volume, and paired with repeating `Vibration`. Device volume, silent/audio routing, denied location permission, unavailable SMS, app suspension, and force-quit can still affect delivery. This foreground timer is not a guaranteed life-safety alarm or a substitute for emergency services; test on target devices and use a properly reviewed background/notification design before relying on it in the field.

Medical information is stored locally but this starter does not encrypt the database or gate the Medical Pass behind authentication. Do not enter real sensitive health data until the app's device security, consent, backup, and privacy requirements have been reviewed.

## Before field use

Verify the device name, service/characteristic UUIDs, byte order, sample units, and sensor calibration against the actual firmware. The battery GATT service is not configured yet. Keep simulator events clearly distinguished from sensor-originated readings. The current impact threshold and countdown are a prototype workflow and are not a validated impact-detection or clinical assessment system.

## BLE sensor protocol

The scan targets the exact advertised name `SnowShield-Sensor`. The sample GATT UUIDs are exported from `src/services/BleManager.ts` and must be replaced with the sensor firmware's service and notification characteristic UUIDs. The default characteristic packet is exactly 24 bytes: six little-endian Float32 values ordered `ax, ay, az, gx, gy, gz`; acceleration defaults to m/s² and is converted axis-by-axis to g, while gyroscope defaults to rad/s. The decoder accepts unit overrides if firmware differs. `SensorContext` receives the converted vector and gyro sample; threshold evaluation happens for every notification, while the dashboard's latest-sample display is throttled to 10 Hz.

After a connected link drops, the app rescans by the target name with exponential backoff (1–20 seconds) until the user stops the BLE session. `react-native-ble-plx` disconnection monitoring is foreground-only; this implementation does not promise reconnection after the OS suspends or terminates the app.
