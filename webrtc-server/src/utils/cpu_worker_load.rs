use mediasoup::router::{Router, RouterId};
use perf_monitor::cpu::{cur_thread_id, ThreadStat};

use crate::{actors::conn::MediaServer, models::sfu::WorkerLoad};

use super::utils::get_now_ms;
pub fn get_less_loaded_router(&mut self, router_network: Vec<Router>) -> RouterId {
    let workers = self.workers.clone();
    for worker in workers.0.into_iter() {
        let last = self.workerloads.get(worker.id());
        if last.is_none() {
            continue;
        };
        if let Some(load) = last {
            let mut cpu;
            let theadid = cur_thread_id().unwrap();
            let mut stat_t = ThreadStat::build(load.pid, load.thread_id).unwrap();
            let mut stat_p = ThreadStat::cur().unwrap();
            let usage_t = stat_t.cpu().unwrap() * 100f64;
            let usage_p = stat_p.cpu().unwrap() * 100f64;
            cpu = usage_t + load.cpu;
            let wall = get_now_ms();
            let result = WorkerLoad {
                pid: load.pid,
                thread_id: load.thread_id,
                cpu,
                worker_id: worker.id(),
                wall,
            };
            self.workerloads.update(worker.id(), result);
        };
    }
    // select least loaded router within the provided routerNetworks
    let mut selected_router = router_network[0].id();
    for r in router_network.into_iter() {
        let pre_router = self.routers2workers.get(r.id());
        let current_router = self.routers2workers.get(selected_router);
        if pre_router.is_none() || current_router.is_none() {
            continue;
        };
        let pre_load = self.workerloads.get(pre_router.unwrap());
        let selected_load = self.workerloads.get(current_router.unwrap());
        if pre_load.is_none() || selected_load.is_none() {
            continue;
        };
        if pre_load.clone().unwrap().cpu == 0.0 && selected_load.clone().unwrap().cpu == 0.0 {
            let wl = selected_load.clone().unwrap();
            let cpu = wl.cpu + 1.0;
            let result = WorkerLoad {
                cpu,
                worker_id: wl.worker_id,
                pid: wl.pid,
                thread_id: wl.thread_id,
                wall: wl.wall,
            };
            self.workerloads.update(wl.worker_id, result);
            selected_router = r.id();
            break;
        }
        if pre_load.clone().unwrap().cpu < selected_load.clone().unwrap().cpu {
            let wl = pre_load.clone().unwrap();
            let cpu = wl.cpu + 1.0;
            let result = WorkerLoad {
                cpu,
                worker_id: wl.worker_id,
                pid: wl.pid,
                thread_id: wl.thread_id,
                wall: wl.wall,
            };
            self.workerloads.update(wl.worker_id, result);
            selected_router = r.id();
        }
    }
    // println!("return less loaded router: {:?}", &selected_router);
    return selected_router;
}
// fe348f21-dd8f-463b-8cbf-dc04a7701965
