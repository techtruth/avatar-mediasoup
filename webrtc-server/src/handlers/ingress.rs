#![allow(non_snake_case, non_camel_case_types, unused_variables)]
use std::sync::Arc;

use log::error;
use mediasoup::{
    prelude::WebRtcTransportOptions, sctp_parameters::NumSctpStreams, transport::Transport,
};

use tokio::sync::{mpsc::Sender, Mutex, RwLock};
use uuid::Uuid;

use crate::{
    config::config::Config,
    models::sfu::{
        Endpoints, Loads, PipeTransports, Relays, RoomRouters, Routers, Routers2Worker,
        Transport2Router, Transports, WebrtcServers,
    },
    utils::{
        codec::{CreatedIngressTransportData, MessageResponse, ResponseMessage, SctpOptions},
        utils::Mut,
        worker_load::get_less_loaded_router,
    },
};

use super::media_relay::create_ingress_relay;

pub async fn create_webrtc_ingress(
    ingress: Option<Uuid>,
    endpoints: Arc<Mutex<Endpoints>>,
    transports: Arc<Mut<Transports>>,
    pipetransports: Arc<Mut<PipeTransports>>,
    relays: Arc<Mutex<Relays>>,
    transport2router: Arc<RwLock<Transport2Router>>,
    webrtc_server: Arc<RwLock<WebrtcServers>>,
    routers: Arc<Mutex<Routers>>,
    room_routers: Arc<Mutex<RoomRouters>>,
    router2worker: Arc<Mutex<Routers2Worker>>,
    loads: Arc<Mutex<Loads>>,
    sctpOptions: SctpOptions,
    routerNetwork: String,
    wsid: String,
    routerPips: Vec<Option<Uuid>>,
    peerId: Uuid,
    config: Config,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let lease_load = get_less_loaded_router(
        routerNetwork.clone(),
        room_routers.clone(),
        router2worker.clone(),
        loads.clone(),
    )
    .await;
    if lease_load.is_none() {
        return Err(format!(
            "No router available for network {}",
            &routerNetwork
        ));
    }
    let router = match routers.lock().await.get(lease_load.unwrap()) {
        Some(r) => r,
        None => return Err("cannot find the router ingress".to_string()),
    };
    let webrtc_server = webrtc_server.read().await.get(router.worker().id());
    if webrtc_server.is_none() {
        return Err("cannot find webrtc server".to_string());
    }
    let mut transport_options = WebRtcTransportOptions::new_with_server(webrtc_server.unwrap());
    transport_options.enable_udp = true;
    transport_options.enable_tcp = true;
    transport_options.prefer_udp = true;
    transport_options.enable_sctp = true;
    transport_options.num_sctp_streams = NumSctpStreams {
        os: sctpOptions.OS,
        mis: sctpOptions.MIS,
    };
    transport_options.initial_available_outgoing_bitrate = 600000;
    let transport_produce = router
        .create_webrtc_transport(transport_options)
        .await
        .map_err(|error| format!("Failed to create producer transport: {}", error))?;
    transport_produce
        .set_max_outgoing_bitrate(3500000)
        .await
        .map_err(|error| format!("Failed to set ingress max outgoing bitrate: {}", error))?;
    // tranports keeps all the ingress relays
    transports.with(|inner| inner.create(peerId.clone(), transport_produce.clone()));
    let transport_producer_id = transport_produce.id();
    let router_id_clone = router.id().clone();
    {
        let mut transport2router_guard = transport2router.write().await;
        let transport_2_router_id =
            transport2router_guard.create(transport_producer_id, router_id_clone);
    }
    // listen when transport is close then clean up
    let t_id = transport_produce.id().clone();
    let r_id = router.id().clone();
    let transport2router_clone = transport2router.clone();
    let endpoints_clone = endpoints.clone();
    let handle = tokio::runtime::Handle::current();
    transport_produce
        .on_close(Box::new(move || {
            handle.spawn(async move {
                let mut transport2Router_remove = transport2router_clone.write().await;
                transport2Router_remove.delete(t_id);
                let mut endpoint_remove = endpoints_clone.lock().await;
                endpoint_remove.delete(t_id);
            });
        }))
        .detach();
    //Create a network transport to ingress for this router, if not already present
    //Create pipe listener, if not already created
    create_ingress_relay(
        router_id_clone.clone(),
        relays.clone(),
        pipetransports.clone(),
        routers.clone(),
        routerNetwork.clone(),
        routerPips.clone(),
        config.clone(),
        sender.clone(),
    )
    .await?;
    let ingress_reply = ResponseMessage::OutgoingCommunication {
        ws: Some(wsid.clone()),
        communication: MessageResponse::createdIngressTransport {
            data: CreatedIngressTransportData {
                id: transport_produce.id().clone(),
                iceParameters: transport_produce.ice_parameters().clone(),
                iceCandidates: transport_produce.ice_candidates().clone(),
                dtlsParameters: transport_produce.dtls_parameters().clone(),
                sctpParameters: transport_produce.sctp_parameters(),
                ingress,
            },
        },
    };
    // endpoints keeps track of the engpoints transport id and peerid
    {
        let mut endpoints_guard = endpoints.lock().await;
        endpoints_guard.create(transport_produce.id(), peerId);
    }
    if let Err(e) = sender.send(ingress_reply).await {
        error!("failed sending ingres reply");
    };
    Ok(())
}
