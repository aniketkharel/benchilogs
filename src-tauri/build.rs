fn main() {
    // Regenerate the embedded Windows icon resources when branding changes.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
