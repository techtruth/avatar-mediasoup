#[cfg(test)]
mod tests {
    use crate::handlers::router::create_router_group;
    use crate::models::sfu::{RoomRouters, Routers, Routers2Worker, Workers};
    use crate::utils::codec::{MessageResponse, ResponseMessage};

    use futures::future::join_all;
    use mediasoup::router::{Router, RouterOptions};
    use mediasoup::worker::Worker;
    use mediasoup::{
        worker::{WorkerLogLevel, WorkerLogTag, WorkerSettings},
        worker_manager::WorkerManager,
    };
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::spawn;
    use tokio::sync::{Mutex, RwLock};
    use uuid::Uuid;

    async fn create_test_worker() -> Worker {
        // Mock a Worker instance. You might need to adjust this to fit your actual Worker creation process.
        let worker_manager = WorkerManager::new();
        let worker = worker_manager
            .create_worker({
                let mut settings = WorkerSettings::default();
                settings.log_level = WorkerLogLevel::Error;
                settings.log_tags = vec![
                    WorkerLogTag::Info,
                    WorkerLogTag::Ice,
                    WorkerLogTag::Dtls,
                    WorkerLogTag::Rtp,
                    WorkerLogTag::Srtp,
                    WorkerLogTag::Rtcp,
                    WorkerLogTag::Rtx,
                    WorkerLogTag::Bwe,
                    WorkerLogTag::Score,
                    WorkerLogTag::Simulcast,
                    WorkerLogTag::Svc,
                    WorkerLogTag::Sctp,
                    WorkerLogTag::Message,
                ];
                settings
            })
            .await;
        worker.unwrap()
    }

    async fn create_test_router(worker: &Worker) -> Router {
        // Mock a Router instance based on the Worker.
        worker
            .create_router(RouterOptions::new(crate::handlers::codecs::media_codecs()))
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn test_create_router_group_new_room() {
        const TASK_COUNT: usize = 100;
        let room_routers = Arc::new(Mutex::new(RoomRouters(HashMap::new())));
        let tasks: Vec<_> = (0..TASK_COUNT)
            .map(|_| {
                let room_routers = room_routers.clone();
                spawn(async move {
                    // Mock a RoomRouters, Workers, Routers, and Routers2Worker.
                    let mut room_routers = room_routers.lock().await;
                    let worker = create_test_worker().await;
                    let workers = RwLock::new(Workers(vec![worker]));
                    let mut routers = Routers(HashMap::new());
                    let mut routers2workers = Routers2Worker(HashMap::new());

                    let room_name = "test_room".to_string();
                    let wsid = "test_wsid".to_string();
                    let ingress = Some(Uuid::new_v4());
                    let egress = Some(Uuid::new_v4());

                    let result = create_router_group(
                        room_name.clone(),
                        wsid.clone(),
                        ingress,
                        egress,
                        &mut room_routers,
                        workers.read().await,
                        &mut routers,
                        &mut routers2workers,
                    )
                    .await;
                    assert!(result.is_ok(), "Expected Ok result");
                    match result {
                        Ok(ResponseMessage::OutgoingCommunication { ws, communication }) => {
                            match communication {
                                MessageResponse::joinedRoom { data } => {
                                    assert_eq!(data.ingress, ingress);
                                    assert_eq!(data.egress, egress);
                                }
                                _ => panic!("Expected joinedRoom message"),
                            }
                            assert_eq!(ws, Some(wsid.clone()));
                        }
                        _ => panic!("Unexpected result variant"),
                    }
                })
            })
            .collect();
        join_all(tasks).await;
        println!("{:?}", room_routers.lock().await.0);
    }
    #[tokio::test]
    async fn test_create_test_router() {
        // Create a test worker
        let worker = create_test_worker().await;

        // Create a router using the test worker
        let router = create_test_router(&worker).await;

        // Check if the router has been successfully created and has certain properties
        // Check if the router has been successfully created by validating its associated worker
        assert!(
            !router.id().to_string().is_empty(),
            "Router should have an ID after creation"
        );
        assert_eq!(
            router.worker().id(),
            worker.id(),
            "Router's worker ID should match the test worker's ID"
        );
    }
}
