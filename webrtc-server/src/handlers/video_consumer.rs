#![allow(non_camel_case_types, non_snake_case)]
use std::{collections::HashMap, ops::Deref, sync::Arc};

use log::{error, info};
use mediasoup::{
    prelude::{AppData, Consumer, ConsumerId, ConsumerOptions},
    rtp_parameters::RtpCapabilities,
    transport::Transport,
};
use tokio::sync::{mpsc::Sender, Mutex, RwLock};
use uuid::Uuid;

use crate::{
    models::{
        message::NewConsumerOptions,
        sfu::{
            PeerConsumed, PeerConsumedData, Routers, Transport2Router, Transports, VideoProducers,
        },
    },
    utils::{
        codec::{appData, MessageResponse, ResponseMessage},
        utils::Mut,
    },
};

pub async fn consume_video(
    wsid: String,
    consumer_peer: Uuid,
    producer_peers: Vec<Uuid>,
    rtpCaps: RtpCapabilities,
    videoProducers: Arc<Mutex<VideoProducers>>,
    peerconsumed: Arc<Mutex<PeerConsumed>>,
    transports: Arc<Mut<Transports>>,
    transport2router: Arc<RwLock<Transport2Router>>,
    routers: Arc<Mutex<Routers>>,
    consumers: Arc<Mutex<HashMap<ConsumerId, Consumer>>>,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let mut video_announcement: HashMap<Uuid, Vec<NewConsumerOptions>> = HashMap::new();
    for peer in producer_peers.into_iter() {
        let get_peer = videoProducers.lock().await.get(peer.clone());
        if get_peer.is_none() {
            info!(
                "Peer {:?} does not have video producer, skipping",
                peer.clone()
            );
            continue;
        }
        for current_peer in get_peer.unwrap().into_iter() {
            let peer_consumed = peerconsumed
                .lock()
                .await
                .find(consumer_peer, current_peer.id());
            if !peer_consumed.is_empty() {
                println!("peer {:?} already consumed!", &peer);
                continue;
            }
            let get_transports = transports.with(|inner| inner.get(consumer_peer));
            if get_transports.is_none() {
                println!("cannot find transports");
                return Err(String::from("cannot find transports"));
            };
            let transport = get_transports.unwrap();
            let get_transport2router = transport2router.read().await.get(transport.clone().id());
            if get_transport2router.is_none() {
                println!("cannot find transport2router");
                return Err(String::from("cannot find transport2router"));
            }
            let transport2router = get_transport2router.unwrap();
            let get_router = routers.lock().await.get(transport2router);
            let producer_id = current_peer.id().clone();
            let app_data = current_peer
                .clone()
                .app_data()
                .deref()
                .clone()
                .downcast::<appData>()
                .unwrap()
                .deref()
                .clone();
            if get_router.is_none() {
                println!("consumer peer transport not defined on this egress server");
                return Err(format!(
                    "Error: consumer peer transport not defined on this egress server. {:?}",
                    transport.clone()
                ));
            }
            let router = get_router.unwrap();
            if router.can_consume(&producer_id, &rtpCaps) {
                let mut consumer_options = ConsumerOptions::new(producer_id, rtpCaps.clone());
                consumer_options.paused = false;
                consumer_options.app_data = AppData::new(app_data.clone());
                let newMediaConsumer = transport
                    .consume(consumer_options)
                    .await
                    .map_err(|error| format!("Failed consume: {:?}", error))?;
                newMediaConsumer.on_producer_pause(|| {}).detach();
                newMediaConsumer.on_producer_resume(|| {}).detach();
                newMediaConsumer
                    .on_producer_close(Box::new(move || {
                        println!("producer stopped");
                    }))
                    .detach();
                // preper relay message
                let video_consumer_options = NewConsumerOptions {
                    id: newMediaConsumer.clone().id(),
                    transportId: transport.clone().id(),
                    producerId: newMediaConsumer.clone().producer_id(),
                    kind: newMediaConsumer.clone().kind(),
                    rtpParameters: newMediaConsumer.clone().rtp_parameters().clone(),
                    appData: newMediaConsumer
                        .app_data()
                        .deref()
                        .clone()
                        .downcast::<appData>()
                        .unwrap()
                        .deref()
                        .clone(),
                };
                video_announcement
                    .entry(peer)
                    .or_default()
                    .push(video_consumer_options);
                let peer_consumer_data = PeerConsumedData {
                    peer_id: consumer_peer,
                    produce_id: current_peer.id(),
                    consumer_id: newMediaConsumer.id(),
                };
                let mut peer_consumed = peerconsumed.lock().await;
                peer_consumed.create(peer_consumer_data);
                let mut consumers = consumers.lock().await;
                consumers.insert(newMediaConsumer.id(), newMediaConsumer);
            }
        }
    }
    if video_announcement.len() > 0 {
        let reply_consumer = ResponseMessage::OutgoingCommunication {
            ws: Some(wsid.clone()),
            communication: MessageResponse::videoAnnouncement {
                data: video_announcement.clone(),
            },
        };

        if let Err(e) = sender.send(reply_consumer).await {
            error!("error sending message: {:?}", e);
        };
    }
    Ok(())
}
