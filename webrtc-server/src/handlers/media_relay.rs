use std::sync::Arc;

use mediasoup::{
    data_structures::SctpState,
    prelude::{ListenIp, PipeTransportOptions},
    router::RouterId,
    transport::Transport,
};
use tokio::sync::{mpsc::Sender, Mutex};
use uuid::Uuid;

use crate::{
    config::config::Config,
    models::sfu::{PipeTransports, Relays, Routers},
    utils::{
        codec::{MessageResponse, ResponseMessage, StorePipRelayData},
        utils::{get_nodeid, Mut},
    },
};

pub async fn create_ingress_relay(
    router_id: RouterId,
    relays: Arc<Mutex<Relays>>,
    pipetransports: Arc<Mut<PipeTransports>>,
    routers: Arc<Mutex<Routers>>,
    room_name: String,
    router_pips: Vec<Option<Uuid>>,
    config: Config,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let piptransports_clone = pipetransports.clone();
    let relay_clone = relays.clone();
    let routers_clone = routers.clone();
    for egrees_server in router_pips {
        if egrees_server.is_none() {
            continue;
        }
        let mut relays_guard = relay_clone.lock().await;
        let relays_guard_read =
            relays_guard.get_ingress_egress(router_id.clone(), egrees_server.unwrap());
        if relays_guard_read.is_empty() {
            let routers_guard = routers_clone.lock().await;
            let get_routers = routers_guard.get(router_id);
            if let Some(router) = get_routers {
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
                };
                let mut pipe_options = PipeTransportOptions::new(listen_ip);
                pipe_options.enable_sctp = true;
                pipe_options.enable_rtx = false;
                pipe_options.enable_srtp = true;
                let new_pipe_transport =
                    router
                        .create_pipe_transport(pipe_options)
                        .await
                        .map_err(|error| {
                            format!("Failed to create ingress Pipe transport: {:?}", error)
                        })?;
                new_pipe_transport
                    .on_sctp_state_change(move |sctp_state| match sctp_state {
                        SctpState::Closed => {
                            println!("pipetransport closed");
                        }
                        SctpState::New => {}
                        SctpState::Connecting => {}
                        SctpState::Connected => {}
                        SctpState::Failed => {}
                    })
                    .detach();
                router
                    .on_close(Box::new(move || {
                        println!("ingress router closed!!!!");
                    }))
                    .detach();
                // relays keeps track of the keys for pipetransports
                relays_guard.create(
                    router_id,
                    egrees_server.clone().unwrap(),
                    new_pipe_transport.id(),
                    room_name.clone(),
                );
                piptransports_clone.with(|p| {
                    p.create(
                        room_name.clone(),
                        new_pipe_transport.id(),
                        new_pipe_transport.clone(),
                    )
                });
                let pipe_replay = ResponseMessage::OutgoingServer {
                    //wsid: Some(wsid.clone()),
                    node: get_nodeid(config.ingress, config.egress),
                    message: MessageResponse::storePipeRelay {
                        data: StorePipRelayData {
                            ingressRoute: router_id.clone(),
                            egress: egrees_server.unwrap(),
                            ip: new_pipe_transport.tuple().local_ip(),
                            port: new_pipe_transport.tuple().local_port(),
                            srtp: new_pipe_transport.srtp_parameters(),
                        },
                    },
                };
                println!(
                    "connecting to Egress relay ip: {} port: {:?}",
                    &new_pipe_transport.tuple().local_ip(),
                    &new_pipe_transport.tuple().local_port()
                );
                let _ = sender.send(pipe_replay).await;
            }
        } else {
            println!("Pipe from this router to this egress server");
        }
    }
    Ok(())
}
