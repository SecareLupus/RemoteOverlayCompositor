function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

type EnvValue<T> = {
  name: string;
  parser: (raw: string) => T;
  defaultValue: T;
};

type OptionalEnvValue<T> = {
  name: string;
  parser: (raw: string) => T;
};

const rawEnv = process.env;

function readEnv<T>({ name, parser, defaultValue }: EnvValue<T>): T {
  const raw = rawEnv[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  try {
    const value = parser(raw);
    if (typeof value === 'number' && Number.isNaN(value)) {
      throw new Error('value is NaN');
    }
    return value;
  } catch (error) {
    throw new Error(`Invalid value for ${name}: ${(error as Error).message}`);
  }
}

function readOptionalEnv<T>({ name, parser }: OptionalEnvValue<T>): T | undefined {
  const raw = rawEnv[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  try {
    const value = parser(raw);
    if (typeof value === 'number' && Number.isNaN(value)) {
      throw new Error('value is NaN');
    }
    return value;
  } catch (error) {
    throw new Error(`Invalid value for ${name}: ${(error as Error).message}`);
  }
}

export interface EnvironmentConfig {
  httpPort: number;
  wsPath: string;
  heartbeatSeconds: number;
  deviceLabel: string;
  deviceId?: string;
  authToken?: string;
  acceptedVersions: string[];
}

export function loadEnvironment(): EnvironmentConfig {
  const config: EnvironmentConfig = {
    httpPort: readEnv({ name: 'COMPOSITOR_PORT', parser: Number, defaultValue: 8080 }),
    wsPath: readEnv({ name: 'COMPOSITOR_WS_PATH', parser: String, defaultValue: '/control' }),
    heartbeatSeconds: readEnv({ name: 'COMPOSITOR_HEARTBEAT', parser: Number, defaultValue: 10 }),
    deviceLabel: readEnv({ name: 'COMPOSITOR_DEVICE_NAME', parser: String, defaultValue: 'RemoteCompositor' }),
    acceptedVersions: readEnv({ name: 'COMPOSITOR_ACCEPT_VERSIONS', parser: parseList, defaultValue: ['1.0'] }),
  };
  const deviceId = readOptionalEnv({ name: 'COMPOSITOR_DEVICE_ID', parser: String });
  if (deviceId !== undefined) {
    config.deviceId = deviceId;
  }
  const authToken = readOptionalEnv({ name: 'COMPOSITOR_AUTH_TOKEN', parser: String });
  if (authToken !== undefined) {
    config.authToken = authToken;
  }
  return config;
}
