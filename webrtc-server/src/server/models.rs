#![allow(non_camel_case_types, non_snake_case)]

use std::{collections::HashMap, net::IpAddr, sync::Arc};

use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

use crate::{
    config::config::Config,
    models::sfu::{
        AudioProducers, Endpoints, EventProducers, Loads, MovementProducers, PeerAudioConsumed,
        PeerConsumed, PeerDataConsumed, PeerMovementConsumed, PendingRelays, PipeTransports,
        RelayRouters, Relays, RoomRouters, RouterIndex, Routers, Routers2Worker, Transport2Router,
        Transports, VideoProducers, WebrtcServers, WorkerLoads, Workers,
    },
    utils::utils::Mut,
};
use mediasoup::data_producer::{DataProducer, DataProducerId};
use mediasoup::prelude::{Consumer, ConsumerId, DataConsumer, DataConsumerId};
use mediasoup::producer::{Producer, ProducerId};

#[derive(Debug, Clone)]
pub struct MediaServer {
    pub config: Config,
    pub ingress: Option<Uuid>,
    pub egress: Option<Uuid>,
    pub num_workers: Option<i32>,
    pub announceip: Option<IpAddr>,
    pub roomRouters: Arc<Mutex<RoomRouters>>,
    pub routers: Arc<Mutex<Routers>>,
    pub transports: Arc<Mut<Transports>>,
    pub transport2router: Arc<RwLock<Transport2Router>>,
    pub relays: Arc<Mutex<Relays>>,
    pub endpoints: Arc<Mutex<Endpoints>>,
    pub peerconsumed: Arc<Mutex<PeerConsumed>>,
    pub peerdataconsumed: Arc<Mutex<PeerDataConsumed>>,
    pub peermovementconsumed: Arc<Mutex<PeerMovementConsumed>>,
    pub peeraudioconsumed: Arc<Mutex<PeerAudioConsumed>>,
    pub pipetransports: Arc<Mut<PipeTransports>>,
    pub pendingRelays: Arc<Mutex<PendingRelays>>,
    pub audioProducers: Arc<Mutex<AudioProducers>>,
    pub videoProducers: Arc<Mutex<VideoProducers>>,
    pub movementProducers: Arc<Mut<MovementProducers>>,
    pub eventProducers: Arc<Mut<EventProducers>>,
    pub relayRouters: Arc<Mutex<RelayRouters>>,
    pub producers: Arc<Mutex<HashMap<ProducerId, Producer>>>,
    pub consumers: Arc<Mutex<HashMap<ConsumerId, Consumer>>>,
    pub data_producers: Arc<Mutex<HashMap<DataProducerId, DataProducer>>>,
    pub data_consumer: Arc<Mutex<HashMap<DataConsumerId, DataConsumer>>>,
    pub workerloads: WorkerLoads,
    pub workers: Arc<RwLock<Workers>>,
    pub routers2workers: Arc<Mutex<Routers2Worker>>,
    pub router_index: RouterIndex,
    pub loads: Arc<Mutex<Loads>>,
    pub webrtc_server: Arc<RwLock<WebrtcServers>>,
}

impl MediaServer {
    pub fn new(config: Config) -> Self {
        Self {
            ingress: config.ingress,
            announceip: Some(config.announceip),
            egress: config.egress,
            num_workers: Some(config.workers),
            roomRouters: Arc::new(Mutex::new(RoomRouters::new())),
            routers: Arc::new(Mutex::new(Routers::new())),
            // peerTranports: PeerTransports::new(),
            transports: Arc::new(Mut::new(Transports::new())),
            transport2router: Arc::new(RwLock::new(Transport2Router::new())),
            relays: Arc::new(Mutex::new(Relays::new())),
            endpoints: Arc::new(Mutex::new(Endpoints::new())),
            peerconsumed: Arc::new(Mutex::new(PeerConsumed::new())),
            peerdataconsumed: Arc::new(Mutex::new(PeerDataConsumed::new())),
            peermovementconsumed: Arc::new(Mutex::new(PeerMovementConsumed::new())),
            peeraudioconsumed: Arc::new(Mutex::new(PeerAudioConsumed::new())),
            pipetransports: Arc::new(Mut::new(PipeTransports::new())),
            pendingRelays: Arc::new(Mutex::new(PendingRelays::new())),
            audioProducers: Arc::new(Mutex::new(AudioProducers::new())),
            videoProducers: Arc::new(Mutex::new(VideoProducers::new())),
            movementProducers: Arc::new(Mut::new(MovementProducers::new())),
            eventProducers: Arc::new(Mut::new(EventProducers::new())),
            relayRouters: Arc::new(Mutex::new(RelayRouters::new())),
            producers: Arc::new(Mutex::new(HashMap::new())),
            consumers: Arc::new(Mutex::new(HashMap::new())),
            data_producers: Arc::new(Mutex::new(HashMap::new())),
            data_consumer: Arc::new(Mutex::new(HashMap::new())),
            workerloads: WorkerLoads::new(),
            workers: Arc::new(RwLock::new(Workers::new())),
            routers2workers: Arc::new(Mutex::new(Routers2Worker::new())),
            router_index: RouterIndex::new(),
            loads: Arc::new(Mutex::new(Loads::new())),
            config,
            webrtc_server: Arc::new(RwLock::new(WebrtcServers::new())),
        }
    }
}
