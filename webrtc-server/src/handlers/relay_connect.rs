use mediasoup::{
    prelude::PipeTransportRemoteParameters, router::RouterId, srtp_parameters::SrtpParameters,
};
use std::{net::IpAddr, sync::Arc};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    models::sfu::{PipeTransports, Relays},
    utils::utils::Mut,
};

pub async fn connect_pipe_relay(
    ingress_route: RouterId,
    egress: Uuid,
    ip: IpAddr,
    port: u16,
    srtp: SrtpParameters,
    pipetransports: Arc<Mut<PipeTransports>>,
    relays: Arc<Mutex<Relays>>,
) -> Result<(), String> {
    let get_pipe_relay = relays
        .lock()
        .await
        .get_ingress_egress(ingress_route, egress);
    if get_pipe_relay.is_empty() == true {
        println!(
            "Pipe relay can not connect. None exists for route:",
            // ingress_route
        );
        return Err(String::from(
            "Pipe relay can not connect. None exists for route",
        ));
    } else {
        let get_pipe_relay = pipetransports.with(|p| p.get(get_pipe_relay[0].transport));
        if let Some(pipe_relay) = get_pipe_relay.clone() {
            //println!("@@ all pipe relays {:?}", &get_pipe_relay);
            println!("@@ is pipe connected {:?}", pipe_relay.is_connected);
            println!("pipe_relay transport {:?}", pipe_relay.transport_id);
            if pipe_relay.is_connected {
                return Err(String::from(
                    "Pipe relay has already connected return, this is not a error",
                ));
            }
            let remote_parameters = PipeTransportRemoteParameters {
                ip,
                port,
                srtp_parameters: Some(srtp),
            };
            println!("connect pipe to: {:?}", &port);
            pipe_relay
                .pipe_transport
                .connect(remote_parameters)
                .await
                .map_err(|error| format!("Failed to connect ingress relay: {:?}", error))?;
            pipe_relay
                .pipe_transport
                .on_sctp_state_change(|state| {
                    println!("pipe relay state changed: {:?}", state);
                })
                .detach();
            println!("before pipe update");
            pipetransports.with(|p| p.update_connected_state(pipe_relay.transport_id));
            println!("after pipe update");
            return Ok(());
        } else {
            Err(String::from("error connect egress relay"))
        }
    }
}
