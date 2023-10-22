use std::sync::Arc;

use crate::{
    config::config::Config,
    models::sfu::{
        Loads, PendingRelays, PipeTransports, RelayRouters, Relays, RoomRouters, Routers,
        Routers2Worker,
    },
    utils::{
        codec::{ConnectPipeRelayData, MessageResponse, ResponseMessage},
        utils::{get_nodeid, Mut},
        worker_load::get_less_loaded_router,
    },
};
use log::error;
use mediasoup::{
    prelude::{ListenIp, PipeTransportOptions, PipeTransportRemoteParameters},
    router::RouterId,
    transport::Transport,
};
use tokio::sync::{mpsc::Sender, Mutex};

pub async fn create_egress_relay(
    group_id: String,
    ingress: RouterId,
    relays: Arc<Mutex<Relays>>,
    routers: Arc<Mutex<Routers>>,
    room_routers: Arc<Mutex<RoomRouters>>,
    router2worker: Arc<Mutex<Routers2Worker>>,
    relay_routers: Arc<Mutex<RelayRouters>>,
    pipetransports: Arc<Mut<PipeTransports>>,
    pending_relays: Arc<Mutex<PendingRelays>>,
    loads: Arc<Mutex<Loads>>,
    config: Config,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let get_relays = relays.lock().await.get_router(ingress);
    if get_relays.is_empty() {
        let get_lease_load = get_less_loaded_router(
            group_id.clone(),
            room_routers.clone(),
            router2worker.clone(),
            loads.clone(),
        )
        .await;
        // let get_group_router = media_server.roomRouters.get(group_id);
        if let Some(lease_load) = get_lease_load {
            let get_pipe_transport = routers.lock().await.get(lease_load);
            if let Some(router) = get_pipe_transport {
                let listen_ip;
                if config.traversenat == "true" {
                    listen_ip = ListenIp {
                        //ip: "127.0.0.1".parse().unwrap(),
                        ip: "0.0.0.0".parse().unwrap(),
                        announced_ip: Some(config.announceip),
                    };
                } else {
                    listen_ip = ListenIp {
                        //ip: "127.0.0.1".parse().unwrap(),
                        ip: local_ipaddress::get().unwrap().parse().unwrap(),
                        announced_ip: None,
                    };
                }
                // let router_id = router.id();
                // let group_router_id = group_router.clone();
                let mut pipe_options = PipeTransportOptions::new(listen_ip);
                pipe_options.enable_sctp = true;
                pipe_options.enable_rtx = false;
                pipe_options.enable_srtp = true;
                let new_pipe_transport = router
                    .clone()
                    .create_pipe_transport(pipe_options)
                    .await
                    .map_err(|error| {
                    format!("Failed to create egress Pipe transport: {:?}", error)
                })?;
                let rt = router.clone();
                new_pipe_transport
                    .on_sctp_state_change(move |sctp_state| {
                        println!(
                            "Egress recv pipe relay connection state:: {:?}, {:?}",
                            sctp_state,
                            rt.id()
                        );
                    })
                    .detach();
                let r_id = router.clone().id();
                let t_id = new_pipe_transport.clone().id();
                let pipe_transport_clone = pipetransports.clone();
                let relay_clone = relays.clone();
                let handle = tokio::runtime::Handle::current();
                router
                    .on_close(Box::new(move || {
                        handle.spawn(async move {
                            println!("egress close pipe");
                            pipe_transport_clone.with(|p| p.delete(t_id));
                            let mut relays_guard = relay_clone.lock().await;
                            relays_guard.delete(r_id);
                        });
                    }))
                    .detach();
                // save relay information
                //  let ingress_id: Uuid = ingress.clone().into();
                let mut relay_routers_guard = relay_routers.lock().await;
                relay_routers_guard.create(ingress, lease_load);
                // router can be routerId
                let egress = get_nodeid(config.ingress, config.egress);
                if egress.is_none() {
                    return Err("no egress found in the nodeId".to_string());
                }
                let mut create_relay = relays.lock().await;
                create_relay.create(
                    ingress,
                    egress.unwrap(),
                    new_pipe_transport.id().clone(),
                    group_id.clone(),
                );
                pipetransports.with(|p| {
                    p.create(
                        group_id,
                        new_pipe_transport.id(),
                        new_pipe_transport.clone(),
                    )
                });
                // connect the new pipe relay to the listerning pipe on the ingress server
                let listening_relay = pending_relays.lock().await.get(ingress);
                if let Some(relay) = listening_relay {
                    let remote_parameters = PipeTransportRemoteParameters {
                        ip: relay.ip.clone(),
                        port: relay.port.clone(),
                        srtp_parameters: Some(relay.srtpParameters.clone()),
                    };
                    println!(
                        "conneting to Ingress relay ip: {} port: {}",
                        &new_pipe_transport.tuple().local_ip(),
                        &new_pipe_transport.tuple().local_port()
                    );
                    new_pipe_transport
                        .connect(remote_parameters)
                        .await
                        .map_err(|error| {
                            format!("Failed to connect Pipe transport: {:?}", error)
                        })?;
                }

                if let Some(node_id) = get_nodeid(config.ingress, config.egress) {
                    let relay_reply = ResponseMessage::OutgoingServer {
                        node: Some(node_id),
                        message: MessageResponse::connectPipeRelay {
                            data: ConnectPipeRelayData {
                                ingressRoute: ingress.clone(),
                                egressRoute: lease_load.clone(),
                                egress: node_id,
                                ip: new_pipe_transport.tuple().local_ip(),
                                port: new_pipe_transport.tuple().local_port(),
                                srtp: new_pipe_transport.srtp_parameters(),
                            },
                        },
                    };
                    if let Err(e) = sender.send(relay_reply).await {
                        error!("failed to send message: {:?}", e);
                    };
                    return Ok(());
                } else {
                    return Err("no node id found".to_string());
                }
            } else {
                return Err(String::from("Cannot find Router from the GroupID"));
            }
        } else {
            return Err(String::from("Cannot find group router!"));
        }
    } else {
        println!("Egress pipe is not valid or already exists");
        return Ok(());
    }
}
