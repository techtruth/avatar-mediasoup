#![allow(non_camel_case_types, non_snake_case)]
use mediasoup::{
    prelude::{AppData, Consumer, ConsumerId, ConsumerOptions},
    producer::ProducerId,
    rtp_parameters::{MediaKind, RtpCapabilities, RtpParameters},
    transport::Transport,
};
use std::{collections::HashMap, ops::Deref, sync::Arc};
use tokio::sync::{mpsc::Sender, Mutex, RwLock};
use uuid::Uuid;

use crate::{
    config::config::Config,
    models::sfu::{PipeTransports, Relays, Transport2Router, Transports},
    utils::{
        codec::{
            appData, CreateRelayProducerMessage, MessageResponse, ProduceMediaData, ResponseMessage,
        },
        utils::{get_nodeid, Mut},
    },
};

pub async fn create_consumer_relay(
    transports: Arc<Mut<Transports>>,
    transport2router: Arc<RwLock<Transport2Router>>,
    relays: Arc<Mutex<Relays>>,
    pipetransports: Arc<Mut<PipeTransports>>,
    routerNetwork: String,
    config: Config,
    wsid: String,
    peer_id: Uuid,
    egress: Uuid,
    _media_type: MediaKind,
    producer_id: ProducerId,
    app_data: appData,
    _rtpParameters: RtpParameters,
    rtp_capabilities: RtpCapabilities,
    consumers: Arc<Mutex<HashMap<ConsumerId, Consumer>>>,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let peer_router = transports.with(|inner| inner.get(peer_id));
    if peer_router.is_none() {
        println!("{}", String::from("cannot find peer router"));
        return Err(String::from("cannot find peer router"));
    }
    let ingress_router = transport2router.read().await.get(peer_router.unwrap().id());
    if ingress_router.is_none() {
        println!("{}", String::from("cannot find transport2router"));
        return Err(String::from("cannot find peer transport2router"));
    }
    let get_transport = relays
        .lock()
        .await
        .get_ingress_egress(ingress_router.unwrap(), egress);
    if get_transport.is_empty() == true {
        println!("cannot find relay in relay consumer transport");
        return Err("cannot find relay in relay consumer transport".to_string());
    } else {
        let relay_consumer = pipetransports.with(|p| p.get(get_transport[0].transport));
        if let Some(consumer) = relay_consumer {
            let mut consumer_options = ConsumerOptions::new(producer_id, rtp_capabilities);
            consumer_options.paused = false;
            consumer_options.app_data = AppData::new(app_data.clone());
            let new_consumer = consumer
                .pipe_transport
                .consume(consumer_options)
                .await
                .map_err(|error| {
                    format!(
                        "Failed to create relay consumer Pipe transport: {:?}",
                        error
                    )
                })?;
            // reply message to server
            let node = get_nodeid(config.ingress, config.egress);
            let relay_consumer_reply = ResponseMessage::OutgoingServer {
                // wsid: Some(wsid.clone()),
                node,
                message: MessageResponse::createRelayProducer {
                    data: CreateRelayProducerMessage {
                        groupId: routerNetwork,
                        peerId: peer_id,
                        ingressRoute: ingress_router.unwrap(),
                        egress: egress,
                        producerId: Some(new_consumer.producer_id()),
                        mediaType: Some(new_consumer.kind()),
                        rtpParameters: Some(new_consumer.rtp_parameters().clone()),
                        appData: new_consumer
                            .app_data()
                            .deref()
                            .clone()
                            .downcast::<appData>()
                            .unwrap()
                            .deref()
                            .clone(),
                        dataProducerId: None,
                        label: None,
                        sctpStreamParameters: None,
                    },
                },
            };
            let _ = sender.send(relay_consumer_reply).await;
            let reply_message = ResponseMessage::OutgoingCommunication {
                ws: Some(wsid.clone()),
                communication: MessageResponse::producedMedia {
                    data: ProduceMediaData {
                        id: new_consumer.producer_id(),
                        kind: new_consumer.kind(),
                        appData: new_consumer
                            .app_data()
                            .deref()
                            .clone()
                            .downcast::<appData>()
                            .unwrap()
                            .deref()
                            .clone(),
                    },
                },
            };
            let _ = sender.send(reply_message).await;
            let mut consumers = consumers.lock().await;
            consumers.insert(new_consumer.id(), new_consumer);
            return Ok(());
        } else {
            Err("error creating consumer relay".to_string())
        }
    }
    //Err("error creating consumer relay".to_string())
}
