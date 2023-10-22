use std::sync::Arc;

use mediasoup::router::RouterId;
use tokio::sync::Mutex;

use crate::{
    models::sfu::{Loads, RoomRouters, Routers2Worker},
    IDX_COUNT,
};

pub async fn get_less_loaded_router(
    router_network: String,
    room_routers: Arc<Mutex<RoomRouters>>,
    routers2workers: Arc<Mutex<Routers2Worker>>,
    loads: Arc<Mutex<Loads>>,
) -> Option<RouterId> {
    let idx = unsafe { IDX_COUNT };
    let get_router = room_routers.lock().await.get(router_network);
    if get_router.is_none() {
        return None;
    }
    let get_router = get_router.unwrap();
    if get_router.len() == 0 {
        println!("no router");
        return None;
    };
    let i = idx % get_router.len();
    println!("current {:?}", i);
    let router = &get_router[i];
    if let Some(w) = routers2workers.lock().await.get(router.clone().id()) {
        // println!("worker loads: {:?}", &self.loads);
        {
            let mut loads = loads.lock().await;
            loads.add(w, router.id().clone());
        }
    } else {
        println!("cannot find router2worker")
    }
    unsafe {
        IDX_COUNT = idx.wrapping_add(1);
    }
    return Some(router.id());
}
