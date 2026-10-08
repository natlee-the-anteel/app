import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { ImpactService } from '../services/ImpactService';
import type {
  AccelerationSample,
  ImpactEvent,
  SensorMotionSample,
} from '../services/ImpactService';
import { BleManagerService } from '../services/BleManager';
import type { SensorPayloadOptions } from '../services/BleManager';

export type ConnectionStatus = 'Disconnected' | 'Scanning' | 'Connected';
export type TelemetrySource = 'mock' | 'sensor';

export interface TelemetryPayload {
  id: string;
  peakAccelerationG: number;
  label: string;
  timestamp: string;
  source: TelemetrySource;
}

interface SensorContextValue {
  connectionStatus: ConnectionStatus;
  batteryLevel: number | null;
  developerMockMode: boolean;
  telemetry: TelemetryPayload[];
  latestTelemetry: TelemetryPayload | null;
  activeImpact: ImpactEvent | null;
  latestSensorReading: SensorMotionSample | null;
  connectedDeviceName: string | null;
  bleSessionActive: boolean;
  bleError: string | null;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setBatteryLevel: (level: number | null) => void;
  setDeveloperMockMode: (enabled: boolean) => void;
  publishTelemetry: (payload: Omit<TelemetryPayload, 'id' | 'timestamp'>) => void;
  emitMockTelemetry: (peakAccelerationG: number, label: string) => void;
  submitAccelerationSample: (sample: AccelerationSample) => void;
  submitSensorReading: (reading: SensorMotionSample) => void;
  startBleScan: (payloadOptions?: SensorPayloadOptions) => Promise<void>;
  stopBleScan: () => Promise<void>;
  dismissImpact: () => void;
}

const SensorContext = createContext<SensorContextValue | undefined>(undefined);
const MAX_TELEMETRY_EVENTS = 30;

export function SensorProvider({ children }: PropsWithChildren) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Disconnected');
  const [batteryLevel, setBatteryLevelState] = useState<number | null>(100);
  const [developerMockMode, setDeveloperMockMode] = useState(true);
  const [telemetry, setTelemetry] = useState<TelemetryPayload[]>([]);
  const [activeImpact, setActiveImpact] = useState<ImpactEvent | null>(null);
  const [latestSensorReading, setLatestSensorReading] = useState<SensorMotionSample | null>(null);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [bleSessionActive, setBleSessionActive] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);
  const impactService = useRef(new ImpactService());
  const bleManager = useRef(new BleManagerService());
  const lastSensorUiUpdate = useRef(0);

  const setBatteryLevel = useCallback((level: number | null) => {
    setBatteryLevelState(level === null ? null : Math.max(0, Math.min(100, Math.round(level))));
  }, []);

  const publishTelemetry = useCallback(
    (payload: Omit<TelemetryPayload, 'id' | 'timestamp'>) => {
      const event: TelemetryPayload = {
        ...payload,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
      };
      setTelemetry((current) => [event, ...current].slice(0, MAX_TELEMETRY_EVENTS));
    },
    [],
  );

  const emitMockTelemetry = useCallback(
    (peakAccelerationG: number, label: string) => {
      if (!developerMockMode) return;
      publishTelemetry({ peakAccelerationG, label, source: 'mock' });
      const event = impactService.current.evaluateMagnitudeG(peakAccelerationG);
      if (event) setActiveImpact((current) => current ?? event);
    },
    [developerMockMode, publishTelemetry],
  );

  const processAccelerationSample = useCallback((sample: AccelerationSample) => {
    const event = impactService.current.evaluate(sample);
    if (!event) return;
    publishTelemetry({
      peakAccelerationG: Math.round(event.accelerationG * 10) / 10,
      label: 'Impact detected',
      source: 'sensor',
    });
    setActiveImpact((current) => current ?? event);
  }, [publishTelemetry]);

  const submitAccelerationSample = processAccelerationSample;

  const submitSensorReading = useCallback((reading: SensorMotionSample) => {
    if (reading.timestamp - lastSensorUiUpdate.current >= 100) {
      lastSensorUiUpdate.current = reading.timestamp;
      setLatestSensorReading(reading);
    }
    processAccelerationSample(reading.acceleration);
  }, [processAccelerationSample]);

  const startBleScan = useCallback(async (payloadOptions?: SensorPayloadOptions) => {
    setBleError(null);
    setBleSessionActive(true);
    setDeveloperMockMode(false);
    try {
      await bleManager.current.start({
        onConnectionStatus: (status) => {
          setConnectionStatus(status);
          if (status === 'Connected') {
            setBatteryLevel(null);
            setBleError(null);
          }
        },
        onDeviceName: setConnectedDeviceName,
        onReading: submitSensorReading,
        onError: setBleError,
      }, payloadOptions);
    } catch (error) {
      setBleSessionActive(false);
      setConnectionStatus('Disconnected');
      setBleError(error instanceof Error ? error.message : 'Could not start Bluetooth.');
    }
  }, [setBatteryLevel, setDeveloperMockMode, submitSensorReading]);

  const stopBleScan = useCallback(async () => {
    setBleSessionActive(false);
    setBleError(null);
    await bleManager.current.stop();
  }, []);

  useEffect(() => () => {
    // Clean up the native BLE manager when the provider unmounts.
    void bleManager.current.destroy();
  }, []);

  const dismissImpact = useCallback(() => setActiveImpact(null), []);

  const value = useMemo<SensorContextValue>(
    () => ({
      connectionStatus,
      batteryLevel,
      developerMockMode,
      telemetry,
      latestTelemetry: telemetry[0] ?? null,
      activeImpact,
      latestSensorReading,
      connectedDeviceName,
      bleSessionActive,
      bleError,
      setConnectionStatus,
      setBatteryLevel,
      setDeveloperMockMode,
      publishTelemetry,
      emitMockTelemetry,
      submitAccelerationSample,
      submitSensorReading,
      startBleScan,
      stopBleScan,
      dismissImpact,
    }),
    [
      connectionStatus,
      batteryLevel,
      developerMockMode,
      telemetry,
      activeImpact,
      latestSensorReading,
      connectedDeviceName,
      bleSessionActive,
      bleError,
      setBatteryLevel,
      publishTelemetry,
      emitMockTelemetry,
      submitAccelerationSample,
      submitSensorReading,
      startBleScan,
      stopBleScan,
      dismissImpact,
    ],
  );

  return <SensorContext.Provider value={value}>{children}</SensorContext.Provider>;
}

export function useSensor(): SensorContextValue {
  const context = useContext(SensorContext);
  if (!context) {
    throw new Error('useSensor must be used within a SensorProvider');
  }
  return context;
}
