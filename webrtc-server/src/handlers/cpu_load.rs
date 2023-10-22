use std::thread;
use std::time::Duration;
use systemstat::{Platform, System};

pub fn get_media_loads() -> Result<f32, String> {
    let sys = System::new();
    match sys.cpu_load_aggregate() {
        Ok(cpu) => {
            // println!("\nMeasuring CPU load...");
            thread::sleep(Duration::from_secs(1));
            let cpu = cpu.done().unwrap();

            let usage_p = cpu.user * 100.0 + cpu.system * 100.0;
            // println!("heghest load: {}", highest_load.clone());
            return Ok(usage_p);
        }
        Err(_) => return Err("error getting cpu".to_string()),
    }
}
