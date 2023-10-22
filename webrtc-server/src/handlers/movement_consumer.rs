use log::{error, info};
use mediasoup::{
    prelude::{AppData, DataConsumer, DataConsumerId, DataConsumerOptions},
    transport::Transport,
};
use std::{collections::HashMap, ops::Deref, sync::Arc};
use tokio::sync::{mpsc::Sender, Mutex};
use uuid::Uuid;

use crate::{
    models::{
        message::NewDataConsumerOptions,
        sfu::{MovementProducers, PeerMovementConsumed, PeerMovementConsumedData, Transports},
    },
    utils::{
        codec::{appData, MessageResponse, ResponseMessage},
        utils::Mut,
    },
};

pub async fn consume_movement(
    wsid: String,
    producer_peers: Vec<Uuid>,
    consumer_peer: Uuid,
    transports: Arc<Mut<Transports>>,
    movment_producers: Arc<Mut<MovementProducers>>,
    peermovementconsumed: Arc<Mutex<PeerMovementConsumed>>,
    data_consumers: Arc<Mutex<HashMap<DataConsumerId, DataConsumer>>>,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let mut movement_announcement: HashMap<Uuid, NewDataConsumerOptions> = HashMap::new();
    for peer in producer_peers.into_iter() {
        let get_transport = transports.with(|inner| inner.get(consumer_peer));
        let get_producers = movment_producers.with(|mp| mp.get(peer).clone());
        if get_producers.is_none() {
            info!(
                "Error: consumer peer movement producer is not defined on this egress server. movement producer {}",
                consumer_peer
            );
            continue;
        }
        let producer = get_producers.unwrap();
        if get_transport.is_none() {
            println!(
                "Error: consumer peer movement transport is not defined on this egress server. movement transport {}",
                consumer_peer
            );
            continue;
        }
        let transport = get_transport.unwrap();
        let app_data = producer
            .clone()
            .app_data()
            .deref()
            .clone()
            .downcast::<appData>()
            .unwrap()
            .deref()
            .clone();
        let mut data_consumer_options =
            DataConsumerOptions::new_sctp_ordered(producer.clone().id());
        data_consumer_options.app_data = AppData::new(app_data.clone());
        let new_data_consumer = transport
            .consume_data(data_consumer_options)
            .await
            .map_err(|_error| format!("Error consuming data movement consumer!"))?;

        new_data_consumer
            .on_close(move || {
                println!("movement consumer closed");
                // addr.do_send(InternalMessage::RemoveDataConsumer(consumer_id_clone.id()));
            })
            .detach();
        let movement_consumer_options = NewDataConsumerOptions {
            id: new_data_consumer.id(),
            transportId: transport.id(),
            dataProducerId: new_data_consumer.data_producer_id(),
            sctpStreamParameters: new_data_consumer.sctp_stream_parameters().unwrap(),
            label: new_data_consumer.label().to_string(),
            protocol: new_data_consumer.protocol().to_string(),
            appData: new_data_consumer
                .app_data()
                .deref()
                .clone()
                .downcast::<appData>()
                .unwrap()
                .deref()
                .clone(),
        };
        let peer_consume_data = PeerMovementConsumedData {
            peer_id: consumer_peer,
            produce_id: new_data_consumer.data_producer_id(),
            consumer_id: new_data_consumer.id(),
        };
        let mut peerdataconsumed = peermovementconsumed.lock().await;
        peerdataconsumed.create(peer_consume_data);
        movement_announcement.insert(peer, movement_consumer_options);
        let mut data_consumers = data_consumers.lock().await;
        data_consumers.insert(new_data_consumer.id(), new_data_consumer);
    }
    if movement_announcement.len() > 0 {
        let reply_consumer = ResponseMessage::OutgoingCommunication {
            ws: Some(wsid.clone()),
            communication: MessageResponse::movementAnnouncement {
                data: movement_announcement,
            },
        };
        if let Err(e) = sender.send(reply_consumer).await {
            error!("error ending message: {:?}", e);
        };
    }
    Ok(())
}
