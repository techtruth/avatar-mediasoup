use std::{collections::hash_map::Entry, sync::Arc};

use crate::{
    models::sfu::{RoomRouters, Routers, Routers2Worker, Workers},
    utils::codec::{JoinRoomData, MessageResponse, ResponseMessage},
};
use colored::Colorize;
use log::error;
use mediasoup::router::RouterOptions;
use tokio::sync::{mpsc::Sender, Mutex, RwLock};
use uuid::Uuid;

pub async fn create_router_group(
    room: String,
    wsid: String,
    ingress: Option<Uuid>,
    egress: Option<Uuid>,
    room_routers: Arc<Mutex<RoomRouters>>,
    workers: Arc<RwLock<Workers>>,
    routers: Arc<Mutex<Routers>>,
    routers2workers: Arc<Mutex<Routers2Worker>>,
    sender: Sender<ResponseMessage>,
) -> Result<(), String> {
    let mut rm_routers = room_routers.lock().await;
    match rm_routers.0.entry(room.clone()) {
        Entry::Occupied(entry) => {
            let r = entry.get();
            let room_router = r[0].clone();
            let resp = ResponseMessage::OutgoingCommunication {
                ws: Some(wsid.clone()),
                communication: MessageResponse::joinedRoom {
                    data: JoinRoomData {
                        roomRTPCapabilities: room_router.rtp_capabilities().clone(),
                        ingress,
                        egress,
                    },
                },
            };
            let _ = sender.send(resp).await;
            return Ok(());
            //  }
        }
        Entry::Vacant(_) => {
            let wks = workers.read().await;
            for (_n, worker) in wks.0.clone().iter().enumerate() {
                let router = worker
                    .create_router(RouterOptions::new(crate::handlers::codecs::media_codecs()))
                    .await
                    .map_err(|error| format!("Failed to create router: {}", error))?;
                // save the router router
                let mut rt = routers.lock().await;
                rt.create(router.id(), router.clone());
                // save the room
                rm_routers.create(room.clone(), router.clone());
                // save routers2workers
                let mut r_t_r = routers2workers.lock().await;
                r_t_r.create(router.id(), worker.id());
            }
            let router = rm_routers.get(room.clone());
            if router.is_none() {
                println!("{}", "No router found".red());
                return Err("No router found".to_string());
            }
            let resp = ResponseMessage::OutgoingCommunication {
                ws: Some(wsid),
                communication: MessageResponse::joinedRoom {
                    data: JoinRoomData {
                        roomRTPCapabilities: router.unwrap()[0].rtp_capabilities().clone(),
                        ingress,
                        egress,
                    },
                },
            };
            if let Err(e) = sender.send(resp).await {
                error!("error seding message: {:?}", e);
            };
            return Ok(());
        }
    }
}
