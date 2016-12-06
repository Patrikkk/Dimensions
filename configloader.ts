import RoutingServer from 'routingserver';

export interface ConfigServer {
  listenPort: number;
  routingServers: RoutingServer[];
}

export interface LogOptions {
  clientTimeouts: boolean;
  clientConnect: boolean;
  clientDisconnect: boolean;
  clientError: boolean;
  tServerConnect: boolean;
  tServerDisconnect: boolean;
  tServerError: boolean;
  clientBlocked: boolean;
  extensionLoad: boolean;
}

interface FakeVersion {
  enabled: boolean;
  terrariaVersion: number;
}

interface BlackList {
  enabled: boolean;
  apiKey: string;
} 

interface RestApi {
  enabled: boolean;
  port: number;
}

export interface ConfigOptions {
  socketTimeout: number;
  currentTerrariaVersion: number;
  fakeVersion: FakeVersion;
  restApi: RestApi;
  blockInvis: boolean;
  blacklist: BlackList;
  log: LogOptions;
}

export interface Config {
  servers: ConfigServer[];
  options: ConfigOptions;
}


export const ConfigSettings: Config = require(`../config.js`).ConfigSettings;