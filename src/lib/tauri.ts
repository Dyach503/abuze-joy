import { invoke } from "@tauri-apps/api/core";

export interface RouteEntry {
  value: string;
  enabled: boolean;
  note: string;
}

export interface RoutesConfig {
  domains: RouteEntry[];
  ips: RouteEntry[];
}

export interface ServerConfig {
  address: string;
  port: number;
  uuid: string;
  flow: string;
  encryption: string;
  network: string;
  security: string;
  sni: string;
  fingerprint: string;
  alpn: string[];
  public_key: string;
  short_id: string;
  spider_x: string;
}

export type VpnMode = "off" | "vpn_selective" | "zapret" | "vpn_zapret" | "vpn_full";

export interface StatusInfo {
  mode: VpnMode;
  zapret_running: boolean;
  singbox_running: boolean;
}

export interface AppRouteEntry {
  path: string;
  enabled: boolean;
  note: string;
}

export interface AppRoutesConfig {
  apps: AppRouteEntry[];
}

export type ZapretStrategy =
  | "normal"
  | "normal_plus"
  | "normal_discord"
  | "auto"
  | "builder"
  | "custom";

export interface DesyncAction {
  method: string; // fake | multisplit | multidisorder | fakedsplit | rst | circular | wssize
  blob: string; // .bin filename, inline 0xHEX, or built-in (fake_default_*)
  pos: string;
  seqovl: string;
  tcp_ts: string;
  repeats: string;
  pattern: string;
  tls_mod: string;
  strategy: string; // circular group tag → strategy=N
  ip_autottl: string; // e.g. -1,3-20
  tcp_md5: boolean; // bare fooling flag
  // circular parameters
  fails: string;
  maxtime: string;
  retrans: string;
  maxseq: string;
  reset: boolean;
  udp_out: string;
  udp_in: string;
  // wssize parameters
  wsize: string;
  scale: string;
}

export interface ZapretProfile {
  name: string;
  l4: "tcp" | "udp";
  ports: string;
  l7: string[];
  payload: string;
  hostlist_domains: string;
  in_range: string;
  out_range: string;
  desyncs: DesyncAction[];
}

export interface ZapretConfig {
  strategy: ZapretStrategy;
  tcp_ports: string;  // Port ranges like "80,443,8000-9000"
  udp_ports: string;  // Port ranges like "443,50000-65535"
  custom_args: string;
  profiles: ZapretProfile[];
}

export interface AutotestResult {
  strategy: string;
  success: boolean;
  response_time_ms: number;
  error: string | null;
}

// Routes
export const getRoutes = () => invoke<RoutesConfig>("get_routes");
export const addDomain = (value: string, note: string) =>
  invoke<RoutesConfig>("add_domain", { value, note });
export const addIp = (value: string, note: string) =>
  invoke<RoutesConfig>("add_ip", { value, note });
export const removeDomain = (value: string) =>
  invoke<RoutesConfig>("remove_domain", { value });
export const removeIp = (value: string) =>
  invoke<RoutesConfig>("remove_ip", { value });
export const toggleDomain = (value: string, enabled: boolean) =>
  invoke<RoutesConfig>("toggle_domain", { value, enabled });
export const toggleIp = (value: string, enabled: boolean) =>
  invoke<RoutesConfig>("toggle_ip", { value, enabled });
export const importRoutes = (jsonStr: string) =>
  invoke<RoutesConfig>("import_routes", { jsonStr });
export const exportRoutes = () => invoke<string>("export_routes");

// App Routes
export const getAppRoutes = () => invoke<AppRoutesConfig>("get_app_routes");
export const addApp = (path: string, note: string) =>
  invoke<AppRoutesConfig>("add_app", { path, note });
export const removeApp = (path: string) =>
  invoke<AppRoutesConfig>("remove_app", { path });
export const toggleApp = (path: string, enabled: boolean) =>
  invoke<AppRoutesConfig>("toggle_app", { path, enabled });

// Zapret Routes
export const getZapretRoutes = () => invoke<RoutesConfig>("get_zapret_routes");
export const addZapretDomain = (value: string, note: string) =>
  invoke<RoutesConfig>("add_zapret_domain", { value, note });
export const addZapretIp = (value: string, note: string) =>
  invoke<RoutesConfig>("add_zapret_ip", { value, note });
export const removeZapretDomain = (value: string) =>
  invoke<RoutesConfig>("remove_zapret_domain", { value });
export const removeZapretIp = (value: string) =>
  invoke<RoutesConfig>("remove_zapret_ip", { value });
export const toggleZapretDomain = (value: string, enabled: boolean) =>
  invoke<RoutesConfig>("toggle_zapret_domain", { value, enabled });
export const toggleZapretIp = (value: string, enabled: boolean) =>
  invoke<RoutesConfig>("toggle_zapret_ip", { value, enabled });
export const importZapretRoutes = (jsonStr: string) =>
  invoke<RoutesConfig>("import_zapret_routes", { jsonStr });
export const exportZapretRoutes = () => invoke<string>("export_zapret_routes");
export const importZapretDomainsFromFile = (filePath: string) =>
  invoke<RoutesConfig>("import_zapret_domains_from_file", { filePath });

// Server
export const getServerConfig = () => invoke<ServerConfig>("get_server_config");
export const saveServerConfig = (config: ServerConfig) =>
  invoke<void>("save_server_config", { config });
export const parseVlessUri = (uri: string) =>
  invoke<ServerConfig>("parse_vless_uri", { uri });

// Zapret Config
export const getZapretConfig = () => invoke<ZapretConfig>("get_zapret_config");
export const saveZapretConfig = (config: ZapretConfig) =>
  invoke<void>("save_zapret_config", { config });
export const listZapretBlobs = () => invoke<string[]>("list_zapret_blobs");
export const getZapretLog = () => invoke<string>("get_zapret_log");
export const getSingboxLog = () => invoke<string>("get_singbox_log");

// VPN Control
export const getStatus = () => invoke<StatusInfo>("get_status");
export const setMode = (mode: VpnMode) =>
  invoke<StatusInfo>("set_mode", { mode });
export const applyRoutes = () => invoke<StatusInfo>("apply_routes");

// Zapret Autotest
export const runZapretAutotest = (testDomain: string) =>
  invoke<AutotestResult[]>("run_zapret_autotest", { testDomain });
