use crate::app_routes::AppRoutesConfig;
use crate::routes::RoutesConfig;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub address: String,
    pub port: u16,
    pub uuid: String,
    pub flow: String,
    pub encryption: String,
    pub network: String,
    pub security: String,
    pub sni: String,
    pub fingerprint: String,
    pub alpn: Vec<String>,
    #[serde(default)]
    pub public_key: String,
    #[serde(default)]
    pub short_id: String,
    #[serde(default)]
    pub spider_x: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            address: String::new(),
            port: 443,
            uuid: String::new(),
            flow: "xtls-rprx-vision".into(),
            encryption: "none".into(),
            network: "tcp".into(),
            security: "tls".into(),
            sni: String::new(),
            fingerprint: "chrome".into(),
            alpn: vec!["h2".into(), "http/1.1".into()],
            public_key: String::new(),
            short_id: String::new(),
            spider_x: String::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VpnMode {
    Off,
    #[serde(alias = "selective")]
    VpnSelective,
    Zapret,
    VpnZapret,
    #[serde(alias = "full")]
    VpnFull,
}

// Zapret DPI bypass strategy
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DpiStrategy {
    Normal,
    NormalPlus,
    NormalDiscord,
    /// All-in-one circular auto-rotating strategy (runtime auto-select via zapret-auto.lua).
    Auto,
    /// Visual strategy builder: args are generated from `ZapretConfig::profiles`.
    Builder,
    Custom,
}

/// A single desync action inside a builder profile.
/// Empty string fields are omitted from the generated `--lua-desync=` argument.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DesyncAction {
    pub method: String, // fake | multisplit | multidisorder | fakedsplit | rst | circular | wssize
    #[serde(default)]
    pub blob: String, // fake-packet .bin filename, inline 0xHEX, or built-in (fake_default_*)
    #[serde(default)]
    pub pos: String,
    #[serde(default)]
    pub seqovl: String,
    #[serde(default)]
    pub tcp_ts: String,
    #[serde(default)]
    pub repeats: String,
    #[serde(default)]
    pub pattern: String,
    #[serde(default)]
    pub tls_mod: String,
    /// circular orchestration group tag → `strategy=N`.
    #[serde(default)]
    pub strategy: String,
    /// Auto-TTL fooling, e.g. `-1,3-20`.
    #[serde(default)]
    pub ip_autottl: String,
    /// Emit a bare `tcp_md5` fooling flag.
    #[serde(default)]
    pub tcp_md5: bool,
    // circular parameters
    #[serde(default)]
    pub fails: String,
    #[serde(default)]
    pub maxtime: String,
    #[serde(default)]
    pub retrans: String,
    #[serde(default)]
    pub maxseq: String,
    /// circular: send RST to the retransmitter on failure.
    #[serde(default)]
    pub reset: bool,
    #[serde(default)]
    pub udp_out: String,
    #[serde(default)]
    pub udp_in: String,
    // wssize parameters
    #[serde(default)]
    pub wsize: String,
    #[serde(default)]
    pub scale: String,
}

/// A builder profile: one traffic filter + an ordered list of desync actions.
/// Profiles are joined with `--new` when generating winws2 arguments.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ZapretProfile {
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_l4")]
    pub l4: String, // "tcp" | "udp"
    #[serde(default)]
    pub ports: String,
    #[serde(default)]
    pub l7: Vec<String>,
    #[serde(default)]
    pub payload: String,
    #[serde(default)]
    pub hostlist_domains: String,
    /// In-profile conntrack range filters, e.g. `-s4096` / `-d10`.
    #[serde(default)]
    pub in_range: String,
    #[serde(default)]
    pub out_range: String,
    #[serde(default)]
    pub desyncs: Vec<DesyncAction>,
}

fn default_l4() -> String {
    "tcp".to_string()
}

/// Convert a fake-packet filename into a safe winws2 blob identifier.
fn sanitize_blob_id(file: &str) -> String {
    let base = file.strip_suffix(".bin").unwrap_or(file);
    base.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect()
}

/// A blob value that is loaded from a file (and therefore needs a `--blob=` declaration)
/// rather than an inline hex literal (`0x…`) or a built-in name (`fake_default_*`),
/// both of which are passed through to the desync `blob=` parameter verbatim.
fn blob_is_file(blob: &str) -> bool {
    let b = blob.trim();
    !b.is_empty() && !b.starts_with("0x") && !b.starts_with("fake_default_")
}

/// Resolve the `blob=` parameter value for a desync action: a sanitized id for file blobs
/// (matching the declared `--blob=` name), or the literal value for hex/built-in blobs.
fn blob_param_value(blob: &str) -> String {
    let b = blob.trim();
    if blob_is_file(b) {
        sanitize_blob_id(b)
    } else {
        b.to_string()
    }
}

/// Build winws2 arguments from a list of builder profiles.
/// Path resolution (lua libs, blobs) happens here because only the backend
/// knows the absolute `resources_dir`.
pub fn build_profile_args(
    profiles: &[ZapretProfile],
    resources_dir: &std::path::Path,
) -> Vec<String> {
    fn fwd(path: &std::path::Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    let mut args: Vec<String> = Vec::new();
    if profiles.is_empty() {
        return args;
    }

    // Base Lua libraries — emitted once before any profile.
    // zapret-auto.lua provides the `circular` orchestrator used for runtime auto-select.
    let lua_lib = resources_dir.join("zapret2/lua/zapret-lib.lua");
    let lua_antidpi = resources_dir.join("zapret2/lua/zapret-antidpi.lua");
    let lua_auto = resources_dir.join("zapret2/lua/zapret-auto.lua");
    args.push(format!("--lua-init=@{}", fwd(&lua_lib)));
    args.push(format!("--lua-init=@{}", fwd(&lua_antidpi)));
    args.push(format!("--lua-init=@{}", fwd(&lua_auto)));

    // Declare every unique *file* blob referenced across all desync actions.
    // Inline hex (0x…) and built-in (fake_default_*) blobs are passed through verbatim.
    let mut declared: Vec<String> = Vec::new();
    for p in profiles {
        for d in &p.desyncs {
            let blob = d.blob.trim();
            if blob_is_file(blob) && !declared.iter().any(|b| b == blob) {
                declared.push(blob.to_string());
                let path = resources_dir.join("zapret2/files/fake").join(blob);
                args.push(format!("--blob={}:@{}", sanitize_blob_id(blob), fwd(&path)));
            }
        }
    }

    for (i, p) in profiles.iter().enumerate() {
        if i > 0 {
            args.push("--new".into());
        }

        let l4 = if p.l4 == "udp" { "udp" } else { "tcp" };
        if !p.ports.trim().is_empty() {
            args.push(format!("--filter-{}={}", l4, p.ports.trim()));
        }

        let l7: Vec<&str> = p
            .l7
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if !l7.is_empty() {
            args.push(format!("--filter-l7={}", l7.join(",")));
        }

        if !p.payload.trim().is_empty() {
            args.push(format!("--payload={}", p.payload.trim()));
        }
        if !p.hostlist_domains.trim().is_empty() {
            args.push(format!("--hostlist-domains={}", p.hostlist_domains.trim()));
        }
        if !p.in_range.trim().is_empty() {
            args.push(format!("--in-range={}", p.in_range.trim()));
        }
        if !p.out_range.trim().is_empty() {
            args.push(format!("--out-range={}", p.out_range.trim()));
        }

        for d in &p.desyncs {
            if d.method.trim().is_empty() {
                continue;
            }
            let mut parts: Vec<String> = vec![d.method.trim().to_string()];
            if !d.blob.trim().is_empty() {
                parts.push(format!("blob={}", blob_param_value(d.blob.trim())));
            }
            if !d.pos.trim().is_empty() {
                parts.push(format!("pos={}", d.pos.trim()));
            }
            if !d.seqovl.trim().is_empty() {
                parts.push(format!("seqovl={}", d.seqovl.trim()));
            }
            if !d.pattern.trim().is_empty() {
                parts.push(format!("pattern={}", d.pattern.trim()));
            }
            if !d.tls_mod.trim().is_empty() {
                parts.push(format!("tls_mod={}", d.tls_mod.trim()));
            }
            if !d.repeats.trim().is_empty() {
                parts.push(format!("repeats={}", d.repeats.trim()));
            }
            if !d.tcp_ts.trim().is_empty() {
                parts.push(format!("tcp_ts={}", d.tcp_ts.trim()));
            }
            // circular parameters
            if !d.fails.trim().is_empty() {
                parts.push(format!("fails={}", d.fails.trim()));
            }
            if !d.maxtime.trim().is_empty() {
                parts.push(format!("maxtime={}", d.maxtime.trim()));
            }
            if !d.retrans.trim().is_empty() {
                parts.push(format!("retrans={}", d.retrans.trim()));
            }
            if !d.maxseq.trim().is_empty() {
                parts.push(format!("maxseq={}", d.maxseq.trim()));
            }
            if !d.udp_out.trim().is_empty() {
                parts.push(format!("udp_out={}", d.udp_out.trim()));
            }
            if !d.udp_in.trim().is_empty() {
                parts.push(format!("udp_in={}", d.udp_in.trim()));
            }
            if d.reset {
                parts.push("reset".to_string());
            }
            // wssize parameters
            if !d.wsize.trim().is_empty() {
                parts.push(format!("wsize={}", d.wsize.trim()));
            }
            if !d.scale.trim().is_empty() {
                parts.push(format!("scale={}", d.scale.trim()));
            }
            // fooling
            if !d.ip_autottl.trim().is_empty() {
                parts.push(format!("ip_autottl={}", d.ip_autottl.trim()));
            }
            if d.tcp_md5 {
                parts.push("tcp_md5".to_string());
            }
            // circular orchestration group tag — kept last to match upstream examples.
            if !d.strategy.trim().is_empty() {
                parts.push(format!("strategy={}", d.strategy.trim()));
            }
            args.push(format!("--lua-desync={}", parts.join(":")));
        }
    }

    args
}

impl DpiStrategy {
    /// Returns command-line arguments for winws2 using LUA-based desync approach
    /// Paths are converted to forward-slash format for winws2 compatibility
    pub fn to_args(&self, resources_dir: &std::path::Path, data_dir: &std::path::Path) -> Vec<String> {
        // Helper function to convert path to forward-slash string
        fn path_to_string(path: &std::path::Path) -> String {
            path.to_string_lossy().replace('\\', "/")
        }

        match self {
            // Normal: TCP 443 with TLS filter and fake packets
            Self::Normal => {
                let lua_lib = resources_dir.join("zapret2/lua/zapret-lib.lua");
                let lua_antidpi = resources_dir.join("zapret2/lua/zapret-antidpi.lua");
                let lua_auto = resources_dir.join("zapret2/lua/zapret-auto.lua");
                let blob_file = resources_dir.join("zapret2/files/fake/tls_clienthello_www_google_com.bin");

                vec![
                    format!("--lua-init=@{}", path_to_string(&lua_lib)),
                    format!("--lua-init=@{}", path_to_string(&lua_antidpi)),
                    format!("--lua-init=@{}", path_to_string(&lua_auto)),
                    format!("--blob=google:@{}", path_to_string(&blob_file)),
                    "--filter-tcp=443".into(),
                    "--filter-l7=tls".into(),
                    "--payload=tls_client_hello".into(),
                    "--lua-desync=fakedsplit:pattern=0x00:tcp_ts=-600000".into(),
                ]
            },
            // NormalPlus: Normal + UDP Discord/STUN + Discord hostlist
            Self::NormalPlus => {
                let lua_lib = resources_dir.join("zapret2/lua/zapret-lib.lua");
                let lua_antidpi = resources_dir.join("zapret2/lua/zapret-antidpi.lua");
                let lua_auto = resources_dir.join("zapret2/lua/zapret-auto.lua");
                let blob_tls = resources_dir.join("zapret2/files/fake/tls_clienthello_www_google_com.bin");
                let blob_quic = resources_dir.join("zapret2/files/fake/quic_initial_www_google_com.bin");
                let discord_list = data_dir.join("discord_list.txt");

                vec![
                    format!("--lua-init=@{}", path_to_string(&lua_lib)),
                    format!("--lua-init=@{}", path_to_string(&lua_antidpi)),
                    format!("--lua-init=@{}", path_to_string(&lua_auto)),
                    format!("--blob=google:@{}", path_to_string(&blob_tls)),
                    format!("--blob=google_quic:@{}", path_to_string(&blob_quic)),
                    "--filter-tcp=443".into(),
                    "--filter-l7=tls".into(),
                    "--payload=tls_client_hello".into(),
                    "--lua-desync=fakedsplit:pattern=0x00:tcp_ts=-600000".into(),
                    "--new".into(),
                    "--filter-udp=19294-19344,50000-50100".into(),
                    "--filter-l7=discord,stun".into(),
                    "--lua-desync=fake:blob=google_quic:repeats=8:tcp_ts=-600000".into(),
                    "--new".into(),
                    format!("--hostlist={}", path_to_string(&discord_list)),
                    "--lua-desync=fakedsplit:pattern=0x00:tcp_ts=-600000".into(),
                ]
            },
            // NormalDiscord: comprehensive strategy for Russian DPI bypass:
            //   Rule 1 (TCP 443, hostlist-filtered): fake + split desync
            //   Rule 2 (UDP Discord/STUN voice ports): QUIC fake
            //   Rule 3 (UDP 443 QUIC, Discord only): STUN fake
            //   Rule 4 (TCP 443, all traffic): Cloudflare SNI mod fallback
            //   Rule 5 (UDP 443 QUIC, all traffic): generic QUIC fake
            //   Rule 6 (TCP 443, YouTube hostlist): fakedsplit
            Self::NormalDiscord => {
                let lua_lib = resources_dir.join("zapret2/lua/zapret-lib.lua");
                let lua_antidpi = resources_dir.join("zapret2/lua/zapret-antidpi.lua");
                let lua_auto = resources_dir.join("zapret2/lua/zapret-auto.lua");
                let blob_gosuslugi = resources_dir.join("zapret2/files/fake/tls_clienthello_gosuslugi_ru.bin");
                let blob_stun = resources_dir.join("zapret2/files/fake/stun.bin");
                let blob_google_quic = resources_dir.join("zapret2/files/fake/quic_initial_www_google_com.bin");
                let host_list = data_dir.join("zapret_domains.txt");

                vec![
                    // Rule 1: TCP 443 TLS — hostlist from manager (zapret_domains.txt).
                    format!("--lua-init=@{}", path_to_string(&lua_lib)),
                    format!("--lua-init=@{}", path_to_string(&lua_antidpi)),
                    format!("--lua-init=@{}", path_to_string(&lua_auto)),
                    format!("--blob=fake_gosuslugi:@{}", path_to_string(&blob_gosuslugi)),
                    format!("--blob=fake_stun:@{}", path_to_string(&blob_stun)),
                    format!("--blob=google_quic:@{}", path_to_string(&blob_google_quic)),
                    // Rule 1 filter: TCP 443 TLS — hostlist comes from manager
                    "--filter-tcp=443".into(),
                    "--filter-l7=tls".into(),
                    "--payload=tls_client_hello".into(),
                    "--lua-desync=fake:blob=fake_gosuslugi:tcp_ts=-10000:repeats=6".into(),
                    "--lua-desync=multisplit:pos=10:seqovl=652".into(),
                    "--lua-desync=fakedsplit:pattern=0x00:tcp_ts=-600000".into(),
                    "--new".into(),
                    // Rule 2: Discord/STUN UDP voice ports (no hostlist = all traffic)
                    "--filter-udp=19294-19344,50000-50100".into(),
                    "--filter-l7=stun,discord".into(),
                    "--lua-desync=fake:blob=google_quic:repeats=8:tcp_ts=-600000".into(),
                    "--new".into(),
                    // Rule 3: Discord QUIC UDP 443
                    "--filter-udp=443".into(),
                    "--filter-l7=quic".into(),
                    "--hostlist-domains=discord.com,discordapp.com,discord.gg".into(),
                    "--payload=quic_initial".into(),
                    "--lua-desync=fake:blob=fake_stun:tcp_ts=-20000:repeats=8".into(),
                    "--new".into(),
                    // Rule 4: TCP 443 — Cloudflare SNI mod fallback (no hostlist = all traffic)
                    format!("--hostlist={}", path_to_string(&host_list)),
                    "--filter-tcp=443".into(),
                    "--filter-l7=tls".into(),
                    "--payload=tls_client_hello".into(),
                    "--lua-desync=fake:blob=fake_gosuslugi:tcp_ts=-10000:tls_mod=rnd,dupsid,sni=www.cloudflare.com:repeats=3".into(),
                    "--lua-desync=multidisorder:pos=midsld,sniext+1,endhost-2:seqovl=652".into(),
                    "--new".into(),
                    // Rule 5: Generic QUIC UDP 443 (no hostlist = all traffic)
                    format!("--hostlist={}", path_to_string(&host_list)),
                    "--filter-udp=443".into(),
                    "--filter-l7=quic".into(),
                    "--payload=quic_initial".into(),
                    // reuse google_quic blob (same file, no need for a duplicate name)
                    "--lua-desync=fake:blob=google_quic:tcp_ts=-10000:repeats=6".into(),
                    "--new".into(),
                    // Rule 6: YouTube TCP 443
                    "--filter-tcp=443".into(),
                    "--filter-l7=tls".into(),
                    "--payload=tls_client_hello".into(),
                    "--hostlist-domains=rutracker.org".into(),
                    "--lua-desync=fake:blob=fake_gosuslugi:tcp_ts=-10000:repeats=6".into(),
                    "--lua-desync=multisplit:pos=10:seqovl=652".into(),
                ]
            },
            // Auto: all-in-one strategy that uses the `circular` orchestrator
            // (zapret-auto.lua) to auto-rotate desync strategies per host at runtime.
            // Requires inbound traffic capture (see ZapretManager::start → --wf-*-in).
            Self::Auto => {
                let lua_lib = resources_dir.join("zapret2/lua/zapret-lib.lua");
                let lua_antidpi = resources_dir.join("zapret2/lua/zapret-antidpi.lua");
                let lua_auto = resources_dir.join("zapret2/lua/zapret-auto.lua");
                let blob_quic_google = resources_dir.join("zapret2/files/fake/quic_initial_www_google_com.bin");

                vec![
                    format!("--lua-init=@{}", path_to_string(&lua_lib)),
                    format!("--lua-init=@{}", path_to_string(&lua_antidpi)),
                    format!("--lua-init=@{}", path_to_string(&lua_auto)),
                    format!("--blob=quic_google:@{}", path_to_string(&blob_quic_google)),
                    // P1: TCP 443 TLS — circular rotation of three split strategies.
                    "--filter-tcp=443".into(),
                    "--filter-l7=tls".into(),
                    "--in-range=-s4096".into(),
                    "--out-range=-d10".into(),
                    "--payload=tls_client_hello".into(),
                    "--lua-desync=circular:fails=2:maxtime=30:retrans=2:maxseq=16384:reset".into(),
                    "--lua-desync=wssize:wsize=1:scale=6".into(),
                    "--lua-desync=multidisorder:pos=1,midsld:strategy=1".into(),
                    "--lua-desync=wssize:wsize=1:scale=6".into(),
                    "--lua-desync=multidisorder:pos=1,sniext+1,host+1,midsld-2,midsld,midsld+2,endhost-1:strategy=2".into(),
                    "--lua-desync=wssize:wsize=1:scale=6".into(),
                    "--lua-desync=multisplit:pos=10:seqovl=1:strategy=3".into(),
                    "--new".into(),
                    // P2: UDP 443 QUIC — circular rotation of two fakes.
                    "--filter-udp=443".into(),
                    "--filter-l7=quic".into(),
                    "--out-range=-d10".into(),
                    "--in-range=-d10".into(),
                    "--payload=quic_initial".into(),
                    "--lua-desync=circular:fails=2:maxtime=30:udp_out=4:udp_in=1".into(),
                    "--lua-desync=fake:blob=quic_google:repeats=5:strategy=1".into(),
                    "--lua-desync=fake:blob=fake_default_quic:repeats=5:strategy=2".into(),
                    "--new".into(),
                    // P3: UDP STUN/Discord voice — zero-blob fake.
                    "--filter-udp=50000-65535".into(),
                    "--filter-l7=stun,discord".into(),
                    "--out-range=-d10".into(),
                    "--payload=stun,discord_ip_discovery".into(),
                    "--lua-desync=fake:blob=0x00000000000000000000000000000000:repeats=2".into(),
                    "--new".into(),
                    // P4: TCP 80 HTTP — fake + fakedsplit with auto-TTL.
                    "--filter-tcp=80".into(),
                    "--filter-l7=http".into(),
                    "--out-range=-d10".into(),
                    "--in-range=-d1".into(),
                    "--payload=http_req".into(),
                    "--lua-desync=fake:blob=fake_default_http:ip_autottl=-1,3-20:tcp_md5".into(),
                    "--lua-desync=fakedsplit:ip_autottl=-1,3-20:tcp_md5".into(),
                ]
            },
            // Builder: args come from ZapretConfig::profiles via strategy_args().
            Self::Builder => vec![],
            // Custom: User provides their own args via custom_args field
            Self::Custom => vec![],
        }
    }
}

// Zapret configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZapretConfig {
    pub strategy: DpiStrategy,
    pub tcp_ports: String,  // Port ranges like "80,443,8000-9000"
    pub udp_ports: String,  // Port ranges like "443,50000-65535"
    pub custom_args: String,
    /// Builder profiles, used only when `strategy == Builder`.
    #[serde(default)]
    pub profiles: Vec<ZapretProfile>,
}

impl Default for ZapretConfig {
    fn default() -> Self {
        Self {
            strategy: DpiStrategy::Normal,
            tcp_ports: "80,443".to_string(),
            udp_ports: "443".to_string(),
            custom_args: String::new(),
            profiles: Vec::new(),
        }
    }
}

impl ZapretConfig {
    /// Resolve the winws2 strategy arguments for this config.
    /// For the `Builder` strategy the args are generated from `profiles`;
    /// for the others it delegates to `DpiStrategy::to_args`.
    pub fn strategy_args(
        &self,
        resources_dir: &std::path::Path,
        data_dir: &std::path::Path,
    ) -> Vec<String> {
        match self.strategy {
            DpiStrategy::Builder => build_profile_args(&self.profiles, resources_dir),
            other => other.to_args(resources_dir, data_dir),
        }
    }
}

impl ServerConfig {
    pub fn parse_vless_uri(uri: &str) -> Result<Self, String> {
        let uri = uri.trim();
        if !uri.starts_with("vless://") {
            return Err("URI must start with vless://".into());
        }
        let without_scheme = &uri[8..];

        let (main_part, fragment) = without_scheme
            .split_once('#')
            .unwrap_or((without_scheme, ""));
        let _ = fragment;

        let (user_host, query) = main_part
            .split_once('?')
            .unwrap_or((main_part, ""));

        let (uuid, host_port) = user_host
            .split_once('@')
            .ok_or("Invalid VLESS URI: missing @")?;

        // Remove trailing slash if present
        let host_port = host_port.trim_end_matches('/');

        let (address, port_str) = if host_port.starts_with('[') {
            // IPv6
            let end = host_port.find(']').ok_or("Invalid IPv6 address")?;
            let addr = &host_port[1..end];
            let port = &host_port[end + 2..]; // skip ]:
            (addr.to_string(), port.to_string())
        } else {
            host_port
                .rsplit_once(':')
                .map(|(a, p)| (a.to_string(), p.to_string()))
                .ok_or("Invalid host:port")?
        };

        let port: u16 = port_str
            .parse()
            .map_err(|_| format!("Invalid port: {}", port_str))?;

        let params: std::collections::HashMap<String, String> = query
            .split('&')
            .filter(|s| !s.is_empty())
            .filter_map(|p| p.split_once('=').map(|(k, v)| (k.to_string(), v.to_string())))
            .collect();

        let security = params.get("security").cloned().unwrap_or_else(|| "tls".into());
        let sni = params
            .get("sni")
            .cloned()
            .unwrap_or_else(|| address.clone());

        Ok(Self {
            address,
            port,
            uuid: uuid.to_string(),
            flow: params.get("flow").cloned().unwrap_or_default(), // Empty if not specified
            encryption: params.get("encryption").cloned().unwrap_or_else(|| "none".into()),
            network: params.get("type").cloned().unwrap_or_else(|| "tcp".into()),
            security,
            sni,
            fingerprint: params.get("fp").cloned().unwrap_or_else(|| "chrome".into()),
            alpn: params
                .get("alpn")
                .map(|a| a.split(',').map(|s| s.to_string()).collect())
                .unwrap_or_else(|| vec!["h2".into(), "http/1.1".into()]),
            public_key: params.get("pbk").cloned().unwrap_or_default(),
            short_id: params.get("sid").cloned().unwrap_or_default(),
            spider_x: params.get("spx")
                .and_then(|s| urlencoding::decode(s).ok().map(|s| s.into_owned()))
                .unwrap_or_default(),
        })
    }
}

/// Clean a domain value for use in sing-box domain_suffix.
/// Removes wildcard prefixes, rejects URL paths and remaining wildcards.
fn clean_domain_for_singbox(domain: &str) -> Option<String> {
    // Strip leading wildcard (*.example.com → example.com)
    let d = domain.strip_prefix("*.").unwrap_or(domain);
    // Reject URL paths (contain /)
    if d.contains('/') {
        return None;
    }
    // Reject remaining wildcards (e.g. cognito-idp.*.amazonaws.com)
    // Use only the base TLD+1 in that case
    if d.contains('*') {
        let parts: Vec<&str> = d.split('.').filter(|p| !p.is_empty()).collect();
        if parts.len() >= 2 {
            return Some(format!("{}.{}", parts[parts.len() - 2], parts[parts.len() - 1]));
        }
        return None;
    }
    if d.is_empty() {
        return None;
    }
    Some(d.to_string())
}

/// Ensure an IP/CIDR string has CIDR notation (add /32 for bare IPs).
fn ensure_cidr(ip: &str) -> String {
    if ip.contains('/') {
        ip.to_string()
    } else {
        format!("{}/32", ip)
    }
}

/// Build a sing-box VLESS outbound JSON object from ServerConfig.
fn build_singbox_vless_outbound(server: &ServerConfig) -> Value {
    let mut outbound = json!({
        "type": "vless",
        "tag": "proxy",
        "server": server.address,
        "server_port": server.port,
        "uuid": server.uuid,
        "packet_encoding": "xudp"
    });

    if !server.flow.is_empty() {
        outbound["flow"] = json!(server.flow);
    }

    match server.security.as_str() {
        "tls" => {
            outbound["tls"] = json!({
                "enabled": true,
                "server_name": server.sni,
                "alpn": server.alpn,
                "utls": {
                    "enabled": true,
                    "fingerprint": server.fingerprint
                }
            });
        }
        "reality" => {
            let mut tls = json!({
                "enabled": true,
                "server_name": server.sni,
                "utls": {
                    "enabled": true,
                    "fingerprint": server.fingerprint
                },
                "reality": {
                    "enabled": true,
                    "public_key": server.public_key,
                    "short_id": server.short_id
                }
            });
            if !server.alpn.is_empty() {
                tls["alpn"] = json!(server.alpn);
            }
            outbound["tls"] = tls;
        }
        _ => {}
    }

    match server.network.as_str() {
        "ws" => {
            outbound["transport"] = json!({
                "type": "ws",
                "path": "/",
                "headers": { "Host": server.sni }
            });
        }
        "grpc" => {
            outbound["transport"] = json!({
                "type": "grpc",
                "service_name": ""
            });
        }
        _ => {}
    }

    outbound
}

/// Generate sing-box configuration for proxy-only mode (no TUN).
/// Used in VpnSelective and VpnZapret when there are no per-app routes.
/// Exposes a mixed SOCKS5+HTTP inbound on :10808 and HTTP on :10809
/// (matches the ports that set_system_proxy() expects).
pub fn generate_singbox_proxy_config(server: &ServerConfig, routes: &RoutesConfig) -> Value {
    let vless_outbound = build_singbox_vless_outbound(server);

    let mut seen = std::collections::HashSet::new();
    let active_domains: Vec<String> = routes
        .domains
        .iter()
        .filter(|d| d.enabled)
        .filter_map(|d| clean_domain_for_singbox(&d.value))
        .filter(|d| seen.insert(d.clone()))
        .collect();

    let active_ips: Vec<String> = routes
        .ips
        .iter()
        .filter(|i| i.enabled)
        .map(|i| ensure_cidr(&i.value))
        .collect();

    let mut rules: Vec<Value> = vec![
        json!({ "ip_is_private": true, "outbound": "direct" }),
    ];
    if !active_domains.is_empty() {
        rules.push(json!({ "domain_suffix": active_domains, "outbound": "proxy" }));
    }
    if !active_ips.is_empty() {
        rules.push(json!({ "ip_cidr": active_ips, "outbound": "proxy" }));
    }

    json!({
        "log": { "level": "info" },
        "dns": {
            "servers": [{ "tag": "dns-remote", "type": "udp", "server": "8.8.8.8", "server_port": 53 }]
        },
        "inbounds": [
            {
                "type": "mixed",
                "tag": "mixed-in",
                "listen": "127.0.0.1",
                "listen_port": 10808,
                "sniff": true,
                "sniff_override_destination": false
            },
            {
                "type": "http",
                "tag": "http-in",
                "listen": "127.0.0.1",
                "listen_port": 10809
            }
        ],
        "outbounds": [
            vless_outbound,
            { "type": "direct", "tag": "direct" }
        ],
        "route": {
            "rules": rules,
            "auto_detect_interface": true,
            "final": "direct"
        }
    })
}

/// Generate sing-box configuration for Full VPN mode.
/// All traffic (except private IPs and VPN server itself) is routed through VLESS.
/// Uses sing-box TUN with auto_route=true — no manual route manipulation needed.
pub fn generate_singbox_full_vpn_config(server: &ServerConfig) -> Value {
    let vless_outbound = build_singbox_vless_outbound(server);

    // Exclude VPN server IP from TUN so sing-box can reach it directly (no loop).
    // Also exclude all IPv6 — we have no IPv6 proxy.
    let server_cidr = ensure_cidr(&server.address);
    let route_exclude = vec![
        server_cidr,
        "::/0".to_string(),
    ];

    json!({
        "log": { "level": "info" },
        "dns": {
            "servers": [
                {
                    "tag": "dns-direct",
                    "type": "udp",
                    "server": "8.8.8.8",
                    "server_port": 53
                }
            ]
        },
        "inbounds": [
            {
                "type": "tun",
                "tag": "tun-in",
                "interface_name": "AbuzeJoyTun",
                "address": ["172.19.0.1/30"],
                "mtu": 9000,
                "auto_route": true,
                "strict_route": false,
                "stack": "mixed",
                "sniff": true,
                "sniff_override_destination": false,
                "route_exclude_address": route_exclude
            }
        ],
        "outbounds": [
            vless_outbound,
            { "type": "direct", "tag": "direct" }
        ],
        "route": {
            "rules": [
                // Intercept DNS and answer via sing-box DNS (no DNS leak through TUN loop)
                { "protocol": "dns", "action": "hijack-dns" },
                // Private IPs go direct (LAN, loopback)
                { "ip_is_private": true, "outbound": "direct" }
            ],
            "auto_detect_interface": true,
            // Everything else → VPN proxy
            "final": "proxy"
        }
    })
}

/// Generate sing-box configuration for per-app VPN routing.
/// sing-box uses TUN + WFP to route traffic from specific processes through VLESS.
pub fn generate_singbox_config(
    server: &ServerConfig,
    vpn_routes: &RoutesConfig,
    app_routes: &AppRoutesConfig,
) -> Value {
    // Clean and deduplicate domains: strip wildcards, reject URL paths
    let mut seen_domains = std::collections::HashSet::new();
    let active_domains: Vec<String> = vpn_routes
        .domains
        .iter()
        .filter(|d| d.enabled)
        .filter_map(|d| clean_domain_for_singbox(&d.value))
        .filter(|d| seen_domains.insert(d.clone()))
        .collect();

    // Ensure all IPs have CIDR notation
    let active_ips: Vec<String> = vpn_routes
        .ips
        .iter()
        .filter(|i| i.enabled)
        .map(|i| ensure_cidr(&i.value))
        .collect();

    let active_app_paths: Vec<String> = app_routes
        .apps
        .iter()
        .filter(|a| a.enabled)
        .map(|a| a.path.clone())
        .collect();

    let vless_outbound = build_singbox_vless_outbound(server);

    // Build routing rules (sing-box 1.11+ rule actions format)
    let mut rules: Vec<Value> = vec![
        // DNS hijack via rule action (replaces legacy dns outbound)
        json!({
            "protocol": "dns",
            "action": "hijack-dns"
        }),
    ];

    // Per-app routing rules (process_path)
    if !active_app_paths.is_empty() {
        rules.push(json!({
            "process_path": active_app_paths,
            "outbound": "proxy"
        }));
    }

    // Domain-based routing
    if !active_domains.is_empty() {
        let domain_suffixes: Vec<String> = active_domains.clone();
        rules.push(json!({
            "domain_suffix": domain_suffixes,
            "outbound": "proxy"
        }));
    }

    // IP-based routing
    if !active_ips.is_empty() {
        rules.push(json!({
            "ip_cidr": active_ips,
            "outbound": "proxy"
        }));
    }

    // Private IPs go direct
    rules.push(json!({
        "ip_is_private": true,
        "outbound": "direct"
    }));

    // Default: direct (only selected apps/domains go through VPN)
    // This is handled by default_outbound

    // Build route_exclude_address: always exclude the VPN server IP so its traffic
    // never enters the TUN (prevents routing loop). Also exclude common DNS servers.
    let server_cidr = ensure_cidr(&server.address);
    let route_exclude = vec![
        server_cidr,
        "8.8.8.8/32".to_string(),
        "8.8.4.4/32".to_string(),
        // Exclude ALL IPv6 — we don't have an IPv6 proxy and sing-box
        // modifying IPv6 routes causes WFP conflicts with WinDivert/zapret
        "::/0".to_string(),
    ];

    json!({
        "log": {
            "level": "info"
        },
        "dns": {
            "servers": [
                {
                    "tag": "dns-direct",
                    "type": "udp",
                    "server": "8.8.8.8",
                    "server_port": 53
                }
            ]
        },
        "inbounds": [
            {
                "type": "tun",
                "tag": "tun-in",
                "interface_name": "AbuzeJoyTun",
                "address": ["172.19.0.1/30"],
                "mtu": 9000,
                "auto_route": true,
                "strict_route": false,
                "stack": "mixed",
                "sniff": true,
                "sniff_override_destination": false,
                "route_exclude_address": route_exclude
            }
        ],
        "outbounds": [
            vless_outbound,
            {
                "type": "direct",
                "tag": "direct"
            }
        ],
        "route": {
            "rules": rules,
            "auto_detect_interface": true,
            "final": "direct"
        }
    })
}
