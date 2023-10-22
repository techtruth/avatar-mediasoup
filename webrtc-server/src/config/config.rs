#![allow(non_camel_case_types, non_snake_case)]
use std::net::{IpAddr, SocketAddr};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Region {
    pub syncToken: String,
    pub createDate: String,
    pub prefixes: Vec<Prefixes>,
}
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Prefixes {
    pub ip_prefix: String,
    pub region: String,
    pub service: String,
    //pub newwork_border_group: String,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub ingress: Option<Uuid>,
    pub egress: Option<Uuid>,
    pub announceip: IpAddr,
    pub server_address: SocketAddr,
    pub workers: i32,
    pub region: String,
    pub traversenat: String,
    pub webrtc_port: u16,
}

impl Config {
    pub fn new(
        ingress: Option<Uuid>,
        egress: Option<Uuid>,
        announceip: IpAddr,
        server_address: SocketAddr,
        workers: i32,
        region: String,
        traversenat: String,
        webrtc_port: u16,
    ) -> Self {
        Self {
            ingress,
            egress,
            announceip,
            server_address,
            workers,
            region,
            traversenat,
            webrtc_port,
        }
    }
}
