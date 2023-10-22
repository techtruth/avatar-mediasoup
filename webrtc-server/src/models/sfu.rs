#![allow(non_snake_case, non_camel_case_types)]
use mediasoup::{
    data_producer::{DataProducer, DataProducerId},
    prelude::{ConsumerId, DataConsumerId, PipeTransport, WebRtcTransport},
    producer::{Producer, ProducerId},
    router::{Router, RouterId},
    srtp_parameters::SrtpParameters,
    transport::TransportId,
    webrtc_server::WebRtcServer,
    worker::{Worker, WorkerId},
};
use os_id::ProcessId;
use std::{collections::HashMap, net::IpAddr, sync::Arc, vec};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::utils::codec::ResponseMessage;
#[derive(Debug)]
pub struct Routers(pub HashMap<RouterId, Router>); // Array of routers

impl Routers {
    pub fn new() -> Self {
        Routers(HashMap::new())
    }

    pub fn create(&mut self, router_id: RouterId, router: Router) -> std::option::Option<Router> {
        self.0.insert(router_id, router)
    }

    pub fn get(&self, router_id: RouterId) -> std::option::Option<Router> {
        match self.0.get(&router_id) {
            Some(r) => Some(r.clone()),
            None => None,
        }
    }

    pub fn remove(&mut self, router_id: RouterId) {
        self.0.remove(&router_id);
    }
}
#[derive(Debug, Clone)]
pub struct RoomRouters(pub HashMap<String, Vec<Router>>);

impl RoomRouters {
    pub fn new() -> Self {
        RoomRouters(HashMap::new())
    }

    pub fn create(&mut self, room: String, router: Router) {
        self.0.entry(room).or_default().push(router)
    }

    pub fn get(&self, room: String) -> std::option::Option<Vec<Router>> {
        match self.0.get(&room) {
            Some(router) => Some(router.clone()),
            None => None,
        }
    }

    pub fn remove(&mut self, room_name: String) {
        self.0.remove(&room_name);
    }
}
#[derive(Clone, Debug)]
pub struct Transports(HashMap<Uuid, WebRtcTransport>); // Array of transports
impl Transports {
    pub fn new() -> Self {
        Transports(HashMap::new())
    }
    pub fn create(&mut self, id: Uuid, transport: WebRtcTransport) {
        self.0.insert(id, transport);
    }
    pub fn get(&self, id: Uuid) -> Option<WebRtcTransport> {
        match self.0.get(&id) {
            Some(t) => Some(t.clone()),
            None => None,
        }
    }
    pub fn remove(&mut self, id: Uuid) {
        self.0.remove(&id);
    }
}
#[derive(Debug, Clone)]
pub struct Relays(pub Vec<PipeTransportsref>); // Array of relays

impl Relays {
    pub fn new() -> Self {
        Relays(vec![])
    }

    pub fn create(
        &mut self,
        router: RouterId,
        egress: Uuid,
        transport: TransportId,
        room_name: String,
    ) {
        self.0.push(PipeTransportsref {
            router,
            egress,
            transport,
            room_name,
        });
    }

    pub fn get_router(&self, router_id: RouterId) -> Vec<PipeTransportsref> {
        self.0
            .clone()
            .into_iter()
            .filter(|r| r.router == router_id)
            .collect()
    }

    pub fn delete(&mut self, ingress: RouterId) {
        self.0.retain(|x| x.router != ingress);
    }

    pub fn get_by_room(&self, room_name: String) -> Option<Vec<PipeTransportsref>> {
        let mut r_data: Vec<PipeTransportsref> = vec![];
        for p in self.0.clone().into_iter() {
            if p.room_name == room_name {
                r_data.push(p)
            }
        }
        Some(r_data)
    }

    pub fn _get_egress(&mut self, egress: Uuid) -> Vec<PipeTransportsref> {
        self.0
            .clone()
            .into_iter()
            .filter(|r| r.egress == egress)
            .collect()
    }
    pub fn _get_egress_transport(
        &self,
        egress: Uuid,
        transport_id: TransportId,
    ) -> Vec<PipeTransportsref> {
        self.0
            .clone()
            .into_iter()
            .filter(|r| r.egress == egress && r.transport == transport_id)
            .collect()
    }
    pub fn get_ingress_egress(&self, ingress: RouterId, egress: Uuid) -> Vec<PipeTransportsref> {
        self.0
            .clone()
            .into_iter()
            .filter(|r| r.router == ingress && r.egress == egress)
            .collect()
    }
}
#[derive(Clone, Debug)]
pub struct PipeTransportsref {
    pub router: RouterId,
    pub egress: Uuid,
    pub transport: TransportId,
    pub room_name: String,
}

#[derive(Clone, Debug)]
pub struct PipeTransports(Vec<PipeTransportData>);

impl PipeTransports {
    pub fn new() -> Self {
        PipeTransports(vec![])
    }
    pub fn create(
        &mut self,
        room_name: String,
        transport_id: TransportId,
        pipe_transport: PipeTransport,
    ) {
        let data = PipeTransportData {
            room_name,
            transport_id,
            pipe_transport,
            is_connected: false,
        };

        self.0.push(data);
    }
    pub fn get(&self, transport_id: TransportId) -> Option<PipeTransportData> {
        self.0
            .clone()
            .into_iter()
            .find(|data| data.transport_id == transport_id)
    }

    pub fn get_by_room(&self, room_name: String) -> Option<Vec<PipeTransportData>> {
        let mut r_data: Vec<PipeTransportData> = vec![];
        for t in self.0.clone().into_iter() {
            if t.room_name == room_name {
                r_data.push(t);
            }
        }
        Some(r_data)
    }

    pub fn update_connected_state(&mut self, transport_id: TransportId) {
        self.get(transport_id)
            .and_then(|mut t| Some(t.is_connected = true));
    }

    pub fn delete(&mut self, transport_id: TransportId) {
        let length_before = self.0.len();
        self.0.retain(|x| x.transport_id != transport_id);
        let length_after = self.0.len();
        if length_before == length_after {
            println!(
                "tried deleting, but pipe transport not found! {:?}",
                transport_id
            );
        } else {
            println!("deleted pipe transport {:?}", transport_id);
        }
    }
}

#[derive(Clone, Debug)]
pub struct PipeTransportData {
    pub room_name: String,
    pub transport_id: TransportId,
    pub pipe_transport: PipeTransport,
    pub is_connected: bool,
}

#[derive(Debug, Clone)]
pub struct PendingRelays(pub HashMap<RouterId, PendingRelaysData>); // store pending relay connections

impl PendingRelays {
    pub fn new() -> Self {
        PendingRelays(HashMap::new())
    }

    pub fn create(
        &mut self,
        router_id: RouterId,
        ip: IpAddr,
        port: u16,
        srtpParameters: SrtpParameters,
    ) {
        self.0.insert(
            router_id,
            PendingRelaysData {
                ip,
                port,
                srtpParameters,
            },
        );
    }

    pub fn get(&self, router_id: RouterId) -> Option<PendingRelaysData> {
        match self.0.get(&router_id) {
            Some(r) => Some(r.clone()),
            None => None,
        }
    }
    pub fn delete(&mut self, router_id: RouterId) {
        self.0.remove(&router_id);
    }
}
#[derive(Clone, Debug)]
pub struct PendingRelaysData {
    pub ip: IpAddr,
    pub port: u16,
    pub srtpParameters: SrtpParameters,
}

#[derive(Debug, Clone)]
pub struct RelayRouters(pub HashMap<RouterId, RouterId>); // Stores the routers that network relay are on

impl RelayRouters {
    pub fn new() -> Self {
        RelayRouters(HashMap::new())
    }

    pub fn create(
        &mut self,
        ingress_router_id: RouterId,
        group_router: RouterId,
    ) -> Option<RouterId> {
        match self.0.insert(ingress_router_id, group_router) {
            Some(r) => Some(r),
            None => None,
        }
    }

    pub fn get(&self, ingress_router_id: RouterId) -> Option<RouterId> {
        match self.0.get(&ingress_router_id) {
            Some(r) => Some(r.clone()),
            None => None,
        }
    }

    pub fn get_by_egress(&self, egress_router: RouterId) -> Option<RouterId> {
        self.0
            .clone()
            .into_iter()
            .find(|(_i, e)| *e == egress_router)
            .map(|(i, _e)| i)
    }

    pub fn delete(&mut self, ingress_router_id: RouterId) {
        self.0.remove(&ingress_router_id);
    }
}

// Associative array resolving one item to another
#[derive(Debug, Clone)]
pub struct Transport2Router(pub HashMap<TransportId, RouterId>); // Associates transport to single router
impl Transport2Router {
    pub fn new() -> Self {
        Transport2Router(HashMap::new())
    }
    pub fn create(&mut self, id: TransportId, router: RouterId) -> Option<RouterId> {
        match self.0.insert(id, router) {
            Some(t) => Some(t),
            None => None,
        }
    }

    pub fn get(&self, transport_id: TransportId) -> std::option::Option<RouterId> {
        match self.0.get(&transport_id) {
            Some(r) => Some(r.clone()),
            None => None,
        }
    }

    pub fn _get_by_router(&self, router_id: RouterId) -> Option<TransportId> {
        self.0
            .clone()
            .into_iter()
            .find(|(_t, r)| r.clone() == router_id)
            .and_then(|(t, _r)| Some(t))
    }

    pub fn delete(&mut self, transport_id: TransportId) {
        self.0.remove(&transport_id);
    }
}

#[derive(Clone, Debug)]
pub struct Endpoints(HashMap<TransportId, Uuid>);

impl Endpoints {
    pub fn new() -> Self {
        Endpoints(HashMap::new())
    }

    pub fn create(&mut self, transport_id: TransportId, peerId: Uuid) {
        self.0.insert(transport_id, peerId);
    }

    pub fn get(&self, transport_id: TransportId) -> std::option::Option<Uuid> {
        match self.0.get(&transport_id) {
            Some(r) => Some(r.clone()),
            None => None,
        }
    }

    pub fn delete(&mut self, transport_id: TransportId) {
        self.0.remove(&transport_id);
    }
}
#[derive(Debug, Clone)]
pub struct AudioProducers(HashMap<Uuid, Vec<Producer>>);
impl AudioProducers {
    pub fn new() -> Self {
        AudioProducers(HashMap::new())
    }
    pub fn create(&mut self, peerid: Uuid, producer: Producer) {
        self.0.entry(peerid).or_default().push(producer)
    }
    pub fn get(&self, peerid: Uuid) -> Option<Vec<Producer>> {
        match self.0.get(&peerid) {
            Some(router) => Some(router.clone()),
            None => None,
        }
    }
    pub fn get_internal<'a>(&'a self, peerid: &Uuid) -> Option<&'a [Producer]> {
        match self.0.get(&peerid) {
            Some(router) => Some(router),
            None => None,
        }
    }
    pub fn get_producer<'a>(
        &'a self,
        peer_id: Uuid,
        producer_id: ProducerId,
    ) -> Option<&'a Producer> {
        self.get_internal(&peer_id)
            .and_then(|p| p.iter().find(|p| p.id() == producer_id))
    }
    pub fn _remove_producer(&mut self, peer_id: Uuid, producer_id: ProducerId) {
        match self.0.get_mut(&peer_id) {
            Some(p) => p.retain(|producer: &Producer| producer.id() != producer_id),
            None => println!("cannot find the producer or don't have a producer to remove"),
        }
    }
    pub fn remove(&mut self, peerid: Uuid) {
        self.0.remove(&peerid);
    }
}
#[derive(Debug, Clone)]
pub struct VideoProducers(HashMap<Uuid, Vec<Producer>>);
impl VideoProducers {
    pub fn new() -> Self {
        VideoProducers(HashMap::new())
    }
    pub fn create(&mut self, peerid: Uuid, producer: Producer) {
        self.0.entry(peerid).or_default().push(producer)
    }
    pub fn get(&self, peerid: Uuid) -> Option<Vec<Producer>> {
        match self.0.get(&peerid) {
            Some(p) => Some(p.clone()),
            None => None,
        }
    }
    pub fn _add(&mut self, peerid: Uuid, producer: Producer) {
        match self.get(peerid) {
            Some(mut p) => p.push(producer),
            None => (),
        }
    }
    pub fn remove_producer(&mut self, peer_id: Uuid, producer_id: ProducerId) {
        match self.0.get_mut(&peer_id) {
            Some(p) => p.retain(|producer: &Producer| producer.id() != producer_id),

            None => println!("cannot find the producer or don't have a producer"),
        }
    }
    pub fn remove(&mut self, peerid: Uuid) {
        self.0.remove(&peerid);
    }
}

#[derive(Clone, Debug)]
pub struct EventProducers(HashMap<Uuid, DataProducer>);
impl EventProducers {
    pub fn new() -> Self {
        EventProducers(HashMap::new())
    }
    pub fn create(&mut self, peer_id: Uuid, producer: DataProducer) {
        self.0.insert(peer_id, producer);
    }
    pub fn get(&self, peerid: Uuid) -> Option<DataProducer> {
        match self.0.get(&peerid) {
            Some(p) => Some(p.clone()),
            None => None,
        }
    }
    pub fn _delete(&mut self, peer_id: Uuid) -> Result<(), String> {
        match self.0.get(&peer_id) {
            Some(_) => {
                self.0.remove(&peer_id);
                return Ok(());
            }
            None => return Err("cannot find peer".to_string()),
        }
    }
    pub fn remove(&mut self, peer_id: Uuid) {
        self.0.remove(&peer_id);
    }
}
#[derive(Clone, Debug)]
pub struct MovementProducers(HashMap<Uuid, DataProducer>);
impl MovementProducers {
    pub fn new() -> Self {
        MovementProducers(HashMap::new())
    }
    pub fn create(&mut self, peer_id: Uuid, producer: DataProducer) {
        self.0.insert(peer_id, producer);
    }
    pub fn get(&self, peerid: Uuid) -> Option<DataProducer> {
        match self.0.get(&peerid) {
            Some(p) => Some(p.clone()),
            None => None,
        }
    }
    pub fn _delete(&mut self, peer_id: Uuid) -> Result<(), String> {
        match self.0.get(&peer_id) {
            Some(_) => {
                self.0.remove(&peer_id);
                return Ok(());
            }
            None => return Err("cannot find peer".to_string()),
        }
    }
    pub fn remove(&mut self, peer_id: Uuid) {
        self.0.remove(&peer_id);
    }
}
#[derive(Clone, Debug)]
pub struct PeerConsumed(Vec<PeerConsumedData>);

impl PeerConsumed {
    pub fn new() -> Self {
        PeerConsumed(vec![])
    }
    pub fn get(&self, peer_id: Uuid) -> Vec<PeerConsumedData> {
        self.0
            .clone()
            .into_iter()
            .filter(|producer| producer.peer_id == peer_id)
            .collect()
    }
    pub fn find(&self, peer_id: Uuid, producer_id: ProducerId) -> Vec<PeerConsumedData> {
        self.0
            .clone()
            .into_iter()
            .filter(|producer| producer.peer_id == peer_id && producer.produce_id == producer_id)
            .collect()
    }
    pub fn create(&mut self, peer: PeerConsumedData) {
        self.0.push(peer)
    }

    pub fn remove(&mut self, peer_id: Uuid) {
        self.0.retain(|x| x.peer_id != peer_id);
    }
}

#[derive(Clone, Debug)]
pub struct PeerConsumedData {
    pub peer_id: Uuid,
    pub produce_id: ProducerId,
    pub consumer_id: ConsumerId,
}
#[derive(Clone, Debug)]
pub struct PeerMovementConsumed(Vec<PeerMovementConsumedData>);

impl PeerMovementConsumed {
    pub fn new() -> Self {
        PeerMovementConsumed(vec![])
    }
    pub fn get(&self, peer_id: Uuid) -> Vec<PeerMovementConsumedData> {
        self.0
            .clone()
            .into_iter()
            .filter(|producer| producer.peer_id == peer_id)
            .collect()
    }
    pub fn _find(
        &self,
        peer_id: Uuid,
        producer_id: DataProducerId,
    ) -> Vec<PeerMovementConsumedData> {
        self.0
            .clone()
            .into_iter()
            .filter(|producer| producer.produce_id == producer_id && producer.peer_id == peer_id)
            .collect()
    }
    pub fn create(&mut self, peer_consume_data: PeerMovementConsumedData) {
        self.0.push(peer_consume_data)
    }
    pub fn remove(&mut self, peer_id: Uuid) {
        self.0.retain(|x| x.peer_id != peer_id);
    }
}

#[derive(Clone, Debug)]
pub struct PeerMovementConsumedData {
    pub peer_id: Uuid,
    pub produce_id: DataProducerId,
    pub consumer_id: DataConsumerId,
}

#[derive(Clone, Debug)]
pub struct PeerAudioConsumed(Vec<PeerAudioConsumedData>);

impl PeerAudioConsumed {
    pub fn new() -> Self {
        PeerAudioConsumed(vec![])
    }
    pub fn get(&self, peer_id: Uuid) -> Vec<PeerAudioConsumedData> {
        self.0
            .clone()
            .into_iter()
            .filter(|producer| producer.peer_id == peer_id)
            .collect()
    }
    pub fn find(&self, peer_id: Uuid, producer_id: ProducerId) -> Vec<PeerAudioConsumedData> {
        self.0
            .clone()
            .into_iter()
            .filter(|producer| producer.peer_id == peer_id && producer.produce_id == producer_id)
            .collect()
    }
    pub fn create(&mut self, peer: PeerAudioConsumedData) {
        self.0.push(peer)
    }

    pub fn remove(&mut self, peer_id: Uuid) {
        self.0.retain(|x| x.peer_id != peer_id);
    }
}

#[derive(Clone, Debug)]
pub struct PeerAudioConsumedData {
    pub peer_id: Uuid,
    pub produce_id: ProducerId,
    pub consumer_id: ConsumerId,
}
#[derive(Clone, Debug)]
pub struct PeerDataConsumed(Vec<PeerDataConsumedData>);

impl PeerDataConsumed {
    pub fn new() -> Self {
        PeerDataConsumed(vec![])
    }
    pub fn get(&self, peer_id: Uuid) -> Vec<PeerDataConsumedData> {
        self.0
            .clone()
            .into_iter()
            .filter(|producer| producer.peer_id == peer_id)
            .collect()
    }
    pub fn _find(&self, peer_id: Uuid, producer_id: DataProducerId) -> Vec<PeerDataConsumedData> {
        self.0
            .clone()
            .into_iter()
            .filter(|producer| producer.produce_id == producer_id && producer.peer_id == peer_id)
            .collect()
    }
    pub fn create(&mut self, peer_consume_data: PeerDataConsumedData) {
        self.0.push(peer_consume_data)
    }
    pub fn remove(&mut self, peer_id: Uuid) {
        self.0.retain(|x| x.peer_id != peer_id);
    }
}

#[derive(Clone, Debug)]
pub struct PeerDataConsumedData {
    pub peer_id: Uuid,
    pub produce_id: DataProducerId,
    pub consumer_id: DataConsumerId,
}
#[derive(Clone, Debug)]
pub struct Routers2Worker(pub HashMap<RouterId, WorkerId>); // Associates routers to their underyling cpu worker
impl Routers2Worker {
    pub fn new() -> Self {
        Routers2Worker(HashMap::new())
    }
    pub fn create(&mut self, router_id: RouterId, worker_id: WorkerId) {
        self.0.insert(router_id, worker_id);
    }
    pub fn get(&self, router_id: RouterId) -> Option<WorkerId> {
        match self.0.get(&router_id) {
            Some(r) => Some(r.clone()),
            None => None,
        }
    }
    pub fn delete(&mut self, router_id: RouterId) {
        match self.0.get(&router_id) {
            Some(_) => {
                self.0.remove(&router_id);
            }
            None => println!("cannot find or don't have a router: {:?}", router_id),
        }
    }
}
#[derive(Clone, Debug)]
pub struct Workers(pub Vec<Worker>);
impl Workers {
    pub fn new() -> Self {
        Workers(vec![])
    }
    pub fn create(&mut self, worker: Worker) {
        self.0.push(worker);
    }
    pub fn _get(&self, worker_id: WorkerId) -> Vec<Worker> {
        self.0
            .clone()
            .into_iter()
            .filter(|w| w.id() == worker_id)
            .collect()
    }
    pub fn _get_all(&self) -> Vec<Worker> {
        self.0.clone().into_iter().collect()
    }
    pub fn _delete(&mut self) -> Result<(), String> {
        self.0.clear();
        return Ok(());
    }
}

#[derive(Clone, Debug)]
pub struct WebrtcServers(pub HashMap<WorkerId, WebRtcServer>);

impl WebrtcServers {
    pub fn new() -> Self {
        Self(HashMap::new())
    }
    pub fn create(&mut self, worker_id: WorkerId, webrtc_server: WebRtcServer) {
        self.0.insert(worker_id, webrtc_server);
    }
    pub fn get(&self, worker_id: WorkerId) -> Option<WebRtcServer> {
        match self.0.get(&worker_id) {
            Some(w) => Some(w.clone()),
            None => None,
        }
    }
}
#[derive(Clone, Debug)]
pub struct Loads(pub HashMap<WorkerId, LoadData>);
impl Loads {
    pub fn new() -> Self {
        Self(HashMap::new())
    }
    pub fn _get(&self, worker_id: WorkerId) -> Option<LoadData> {
        match self.0.get(&worker_id) {
            Some(w) => Some(w.clone()),
            None => None,
        }
    }
    pub fn add(&mut self, worker_id: WorkerId, router_id: RouterId) {
        match self.0.get_mut(&worker_id) {
            Some(w) => {
                w.router_id = router_id;
                w.loads += 1;
            }
            None => {
                self.0.insert(
                    worker_id,
                    LoadData {
                        router_id,
                        loads: 1,
                    },
                );
            }
        }
    }
    pub fn remove(&mut self, worker_id: WorkerId, router_id: RouterId) {
        match self.0.get_mut(&worker_id) {
            Some(w) => {
                w.router_id = router_id;
                if w.loads > 0 {
                    w.loads -= 1;
                }
            }
            None => (),
        }
    }
}
#[derive(Clone, Debug)]
pub struct LoadData {
    pub router_id: RouterId,
    pub loads: u32,
}

#[derive(Clone, Debug)]
pub struct WorkerLoads(pub HashMap<WorkerId, WorkerLoad>);

impl WorkerLoads {
    pub(crate) fn new() -> Self {
        Self(HashMap::new())
    }
    pub fn _create(&mut self, worker_id: WorkerId, worker_load: WorkerLoad) {
        self.0.insert(worker_id, worker_load);
    }
    pub fn _get(&self, worker_id: WorkerId) -> Option<WorkerLoad> {
        match self.0.get(&worker_id) {
            Some(r) => Some(r.clone()),
            None => None,
        }
    }
    pub fn _add(&mut self, worker_id: WorkerId, worker_load: f64) {
        match self._get(worker_id) {
            Some(mut w) => {
                w.cpu += worker_load;
            }
            None => (),
        }
    }
    pub fn _update(&mut self, worker_id: WorkerId, worker_load: WorkerLoad) {
        self.0.insert(worker_id, worker_load);
    }
    pub fn _delete(&mut self, worker_id: WorkerId) -> Result<(), String> {
        match self.0.get(&worker_id) {
            Some(_) => {
                self.0.remove(&worker_id);
                return Ok(());
            }
            None => return Err("cannot find worker".to_string()),
        }
    }
}

#[derive(Clone, Debug)]
pub struct WorkerLoad {
    pub worker_id: WorkerId,
    pub pid: u32,
    pub thread_id: u32,
    pub wall: u128,
    pub cpu: f64,
}

#[derive(Clone, Debug)]
pub struct TempWorker(pub Vec<TempLoad>);
impl TempWorker {
    pub fn new() -> Self {
        Self(vec![])
    }
    pub fn _insert(&mut self, temp_load: TempLoad) {
        self.0.push(temp_load);
    }
    pub fn _delete(&mut self) -> Result<(), String> {
        self.0.clear();
        return Ok(());
    }
}
#[derive(Clone, Debug)]
pub struct TempLoader {
    pub inner: Arc<Mutex<TempLoad>>,
}
#[derive(Clone, Debug)]
pub struct TempLoad {
    pub pid: ProcessId,
    pub thread_id: u32,
}

#[derive(Clone, Debug)]
pub struct RouterIndex(pub usize);

impl RouterIndex {
    pub fn new() -> Self {
        Self(0)
    }
    pub fn _add(&mut self) {
        self.0 += 1;
    }
    // pub fn add(&mut self) {
    //     self.clone().0.fetch_add(1, Ordering::Relaxed);
    // }
    // pub fn reset(&mut self) {
    //     self.clone().0.fetch_sub(1, Ordering::Relaxed);
    // }
    // pub fn get(&self) -> usize {
    //     self.0.load(Ordering::Relaxed)
    // }
}

#[derive(Debug)]
pub struct RegionResponse {
    pub message: ResponseMessage,
    pub region: String,
}
