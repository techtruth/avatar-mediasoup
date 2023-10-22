use std::{collections::HashMap, ops::Deref, sync::Arc};

use mediasoup::{
    data_producer::DataProducerOptions,
    prelude::{
        AppData, DataConsumer, DataConsumerId, DataConsumerOptions, DataProducer, DataProducerId,
        SctpStreamParameters,
    },
    transport::Transport,
};
use tokio::sync::{mpsc::Sender, Mutex, RwLock};
use uuid::Uuid;

use crate::{
    config::config::Config,
    models::sfu::{
        Endpoints, EventProducers, PeerDataConsumed, PeerDataConsumedData, PipeTransports, Relays,
        Transport2Router, Transports,
    },
    utils::{
        codec::{
            appData, CreateRelayProducerMessage, DataProduceOptionsData, MessageResponse,
            ProduceEventData, ResponseMessage,
        },
        utils::{get_nodeid, Mut},
    },
};

pub async fn create_event_data_producer(
    wsid: String,
    router_network: String,
    peer_id: Uuid,
    egress: Uuid,
    produce_options: DataProduceOptionsData,
    transports: Arc<Mut<Transports>>,
    event_producers: Arc<Mut<EventProducers>>,
    transport_2_router: Arc<RwLock<Transport2Router>>,
    pipe_transports: Arc<Mut<PipeTransports>>,
    relays: Arc<Mutex<Relays>>,
    endpoints: Arc<Mutex<Endpoints>>,
    peer_data_consumed: Arc<Mutex<PeerDataConsumed>>,
    data_producers: Arc<Mutex<HashMap<DataProducerId, DataProducer>>>,
    data_consumers: Arc<Mutex<HashMap<DataConsumerId, DataConsumer>>>,
    config: Config,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let data_producer = event_producers.with(|event| event.clone());
    let peer_producer = data_producer.get(peer_id);
    if peer_producer.is_some() {
        return Err(format!(
            "the peer {:?} has already produced event data producerId: {:?}",
            peer_id,
            peer_producer.unwrap().id()
        ));
    }
    let transports = transports.with(|inner| inner.clone());
    let get_transport = transports.get(peer_id);
    if get_transport.is_none() {
        println!("cannot find transport for peer: {}", &peer_id);
        return Err("cannot find transport for peer".to_string());
    } else {
        let transport = get_transport.unwrap();
        let sctp_stream_parameters =
            SctpStreamParameters::new_ordered(produce_options.sctpStreamParameters.streamId);
        let mut data_producer_options = DataProducerOptions::new_sctp(sctp_stream_parameters);
        data_producer_options.label = produce_options.label;
        data_producer_options.protocol = produce_options.protocol;
        data_producer_options.app_data = AppData::new(produce_options.appData.clone());

        let data_producer = transport
            .produce_data(data_producer_options)
            .await
            .map_err(|error| format!("error creating data producer: {:?}", error))?;
        // let producers_clone = data_producers.clone();
        // let producer_id = data_producer.clone().id();
        // let consumers_clone = data_consumers.clone();
        data_producer
            .on_close(Box::new(move || {
                println!("data channel closing this producer");
            }))
            .detach();
        event_producers
            .with(|event_producers| event_producers.create(peer_id, data_producer.clone()));
        //Prepare the media to be sent over the network to a egress server, and send signal
        let get_transport2_router = transport_2_router.read().await.get(transport.id());
        if get_transport2_router.is_none() {
            return Err("cannot find transport to router".to_string());
        }
        let get_relay_data_consumer = relays
            .lock()
            .await
            .get_ingress_egress(get_transport2_router.unwrap(), egress);
        if get_relay_data_consumer.is_empty() {
            return Err("cannot find relay in event producer".to_string());
        }

        let get_relay_transport =
            pipe_transports.with(|p| p.get(get_relay_data_consumer[0].transport));
        if get_relay_transport.is_none() {
            return Err("cannot find pipetransport".to_string());
        }
        let relay_data_tranport = get_relay_transport.unwrap();
        let rtp_capabilities = endpoints.lock().await.get(transport.id());
        if rtp_capabilities.is_none() {
            return Err("cannot find endpoint:".to_string());
        }
        let mut consumer_options =
            DataConsumerOptions::new_sctp_ordered(data_producer.clone().id());
        consumer_options.app_data = AppData::new(produce_options.appData.clone());
        let relay_data_consumer = relay_data_tranport
            .pipe_transport
            .consume_data(consumer_options)
            .await
            .map_err(|error| format!("error consuming data event producer {:?}", error))?;
        let peer_consume_data = PeerDataConsumedData {
            peer_id,
            produce_id: relay_data_consumer.data_producer_id(),
            consumer_id: relay_data_consumer.id(),
        };
        let mut peer_data_consumed = peer_data_consumed.lock().await;
        peer_data_consumed.create(peer_consume_data);
        let mut producers = data_producers.lock().await;
        producers.insert(data_producer.id(), data_producer.clone());
        let mut consumers = data_consumers.lock().await;
        consumers.insert(relay_data_consumer.id(), relay_data_consumer.clone());
        let server_relay = ResponseMessage::OutgoingServer {
            node: get_nodeid(config.ingress, config.egress),
            message: MessageResponse::createRelayProducer {
                data: CreateRelayProducerMessage {
                    groupId: router_network,
                    peerId: peer_id,
                    ingressRoute: get_relay_data_consumer[0].router,
                    egress,
                    producerId: None,
                    mediaType: None,
                    rtpParameters: None,
                    dataProducerId: Some(relay_data_consumer.data_producer_id()),
                    label: Some(relay_data_consumer.label().to_string()),
                    sctpStreamParameters: relay_data_consumer.sctp_stream_parameters().clone(),
                    appData: relay_data_consumer
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
        let _ = sender.send(server_relay).await;
        let produced_message = ResponseMessage::OutgoingCommunication {
            ws: Some(wsid.clone()),
            communication: MessageResponse::producedEvents {
                data: ProduceEventData {
                    dataProducerId: data_producer.id(),
                    label: data_producer.label().to_string(),
                    appData: data_producer
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
        let _ = sender.send(produced_message).await;
        return Ok(());
    }
}
