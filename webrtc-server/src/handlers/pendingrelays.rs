use std::{net::IpAddr, sync::Arc};

use mediasoup::{router::RouterId, srtp_parameters::SrtpParameters};
use tokio::sync::Mutex;

use crate::models::sfu::PendingRelays;

pub async fn store_pipe_relay(
    pending_relays: Arc<Mutex<PendingRelays>>,
    ingress_router: RouterId,
    ip: IpAddr,
    port: u16,
    srtp: SrtpParameters,
) -> Result<(), String> {
    pending_relays
        .lock()
        .await
        .create(ingress_router, ip, port, srtp);
    Ok(())
}
