use std::{
    net::{self, IpAddr, ToSocketAddrs},
    str::FromStr,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use clap::Parser;
use uuid::Uuid;

use crate::config::config::Config;

use super::arg::Args;

pub fn get_now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
}

pub fn init() -> Config {
    let args = Args::parse();
    let server_address = args.url.to_socket_addrs().unwrap();
    let traversenat = args.traverse_nat;
    let region = args.region;
    let webrtc_port = args.port_transport;
    let mut addr = net::SocketAddr::from_str("0.0.0.0:1188").unwrap();
    for ip in server_address.into_iter() {
        if ip.is_ipv4() {
            addr = ip
        } else {
            println!("looking for ipv4");
        }
    }

    let announceip = IpAddr::from_str(args.announceip.as_str()).unwrap();
    //let addr = net::SocketAddr::from(server_address.unwrap().as_str()).unwrap();
    let ingress = check_server(args.ingress.clone());
    let egress = check_server(args.egress.clone());
    let workers = args.workers;
    Config::new(
        ingress,
        egress,
        announceip,
        addr.clone(),
        workers,
        region,
        traversenat,
        webrtc_port,
    )
}

pub fn check_server(istrue: String) -> Option<Uuid> {
    if istrue == "true" {
        Some(uuid::Uuid::new_v4())
    } else {
        None
    }
}
pub fn get_nodeid(ingress: Option<Uuid>, egress: Option<Uuid>) -> Option<Uuid> {
    if ingress != None {
        ingress
    } else if egress != None {
        egress
    } else {
        None
    }
}
pub type Error = Box<dyn std::error::Error + Send + Sync>;

#[derive(Debug)]
pub struct Mut<T>(Mutex<T>);

impl<T> Mut<T> {
    pub fn new(inner: T) -> Self {
        Self(Mutex::new(inner))
    }
    pub fn with<O>(&self, func: impl FnOnce(&mut T) -> O) -> O {
        let mut guard = self.0.lock().unwrap();
        func(&mut *guard)
    }
}
