#![allow(non_camel_case_types, non_snake_case)]
use std::sync::Arc;

use mediasoup::{
    prelude::WebRtcTransportOptions, sctp_parameters::NumSctpStreams, transport::Transport,
};
use tokio::sync::{mpsc::Sender, Mutex, RwLock};
use uuid::Uuid;

use crate::{
    models::sfu::{
        Endpoints, Loads, RoomRouters, Routers, Routers2Worker, Transport2Router, Transports,
        WebrtcServers,
    },
    utils::{
        codec::{CreatedEgressTransportData, MessageResponse, ResponseMessage, SctpOptions},
        utils::Mut,
        worker_load::get_less_loaded_router,
    },
};

pub async fn create_webrtc_egress(
    routers: Arc<Mutex<Routers>>,
    room_routers: Arc<Mutex<RoomRouters>>,
    router2worker: Arc<Mutex<Routers2Worker>>,
    webrtc_server: Arc<RwLock<WebrtcServers>>,
    transports: Arc<Mut<Transports>>,
    endpoints: Arc<Mutex<Endpoints>>,
    transport2router: Arc<RwLock<Transport2Router>>,
    loads: Arc<Mutex<Loads>>,
    sctpOptions: SctpOptions,
    routerNetwork: String,
    wsid: String,
    peerId: Uuid,
    egress: Option<Uuid>,
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

    let routers = routers.lock().await;
    let router = match routers.get(lease_load.unwrap()) {
        Some(r) => r,
        None => {
            return Err("cannot find router".to_string());
        }
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
        .map_err(|error| format!("Failed to egress set max outgoing bitrate: {}", error))?;
    transports.with(|inner| inner.create(peerId.clone(), transport_produce.clone()));

    let mut transport2router_guard = transport2router.write().await;
    transport2router_guard.create(transport_produce.id().clone(), router.id().clone());
    // listen when transport is close then clean up
    let t_id = transport_produce.id().clone();
    let transport2router_clone = transport2router.clone();
    let endpoints_clone = endpoints.clone();
    let handle = tokio::runtime::Handle::current();
    transport_produce
        .on_close(Box::new(move || {
            handle.spawn(async move {
                println!("egress closed!!!!!");
                let mut transport2Router_remove = transport2router_clone.write().await;
                transport2Router_remove.delete(t_id);
                let mut endpoint_remove = endpoints_clone.lock().await;
                endpoint_remove.delete(t_id);
            });
        }))
        .detach();
    let egress_reply = ResponseMessage::OutgoingCommunication {
        ws: Some(wsid),
        communication: MessageResponse::createdEgressTransport {
            data: CreatedEgressTransportData {
                id: transport_produce.id(),
                iceParameters: transport_produce.ice_parameters().clone(),
                iceCandidates: transport_produce.ice_candidates().clone(),
                dtlsParameters: transport_produce.dtls_parameters().clone(),
                sctpParameters: transport_produce.sctp_parameters(),
                egress,
            },
        },
    };
    // endpoints keeps track of the engpoints transport id and peerid
    let mut endpoints_guard = endpoints.lock().await;
    endpoints_guard.create(transport_produce.id(), peerId);
    // send message back to api
    let _ = sender.send(egress_reply).await;

    Ok(())
}
