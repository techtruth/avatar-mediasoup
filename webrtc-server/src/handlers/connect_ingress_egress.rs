use std::sync::Arc;

use colored::Colorize;
use log::error;
use mediasoup::prelude::{DtlsParameters, WebRtcTransportRemoteParameters};
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

use crate::{
    models::sfu::Transports,
    utils::{
        codec::{MessageResponse, ResponseMessage},
        utils::Mut,
    },
};

pub async fn connect_webrtc(
    wsid: String,
    transport_id: Uuid,
    dtls_parameters: DtlsParameters,
    is_ingress: bool,
    transports: Arc<Mut<Transports>>,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let transport_guard = transports.with(|inner| inner.clone());
    let get_transport = transport_guard.get(transport_id);
    if get_transport.is_none() {
        println!("transport not found");
        return Err(String::from("transport not found"));
    } else {
        let transport = get_transport.unwrap();
        let remote_parameters = WebRtcTransportRemoteParameters { dtls_parameters };
        transport
            .connect(remote_parameters)
            .await
            .map_err(|error| format!("Failed to connect ingress webrtc: {}", error))?;
        transport
            .on_sctp_state_change(move |state| {
                println!("sctp state: {:?}", state);
            })
            .detach();
        if is_ingress {
            let replay_message = ResponseMessage::OutgoingCommunication {
                ws: Some(wsid),
                communication: MessageResponse::connectedIngressTransport {},
            };
            if let Err(e) = sender.send(replay_message).await {
                error!("sending error: {:?}", e);
            };
            return Ok(());
        } else {
            let replay_message = ResponseMessage::OutgoingCommunication {
                ws: Some(wsid),
                communication: MessageResponse::connectedEgressTransport {},
            };
            if let Err(e) = sender.send(replay_message).await {
                error!("sending error: {:?}", e);
            };
            println!(
                "{}",
                "sent ingress transport connected!".red().on_black().bold()
            );
            return Ok(());
        }
    }
}
