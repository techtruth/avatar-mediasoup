#[cfg(test)]
mod tests {
    use crate::handlers::cpu_load::get_media_loads;

    #[tokio::test]
    async fn test_cpu_load() {
        match get_media_loads() {
            Ok(percentage) => {
                assert!(
                    percentage >= 0.0 && percentage <= 100.0,
                    "CPU usage percentage should be between 0 and 100"
                );
            }
            Err(e) => {
                panic!("Unexpected error: {}", e);
            }
        }
    }
}
