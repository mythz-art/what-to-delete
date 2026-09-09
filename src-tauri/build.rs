fn main() {
    // ---- MSVC runtime shim (WebView2LoaderStatic.lib static linking) ----
    // Only for windows-gnu targets; compiles msvc_shim.c + msvc_shim.S with the
    // mingw cross compiler and links it before the dependency rlibs.
    let target = std::env::var("TARGET").unwrap_or_default();
    if target == "x86_64-pc-windows-gnu" {
        let out = std::env::var("OUT_DIR").unwrap();
        let gcc = std::env::var("CC_x86_64_pc_windows_gnu")
            .unwrap_or_else(|_| "x86_64-w64-mingw32-gcc".into());
        let ar = std::env::var("AR_x86_64_pc_windows_gnu")
            .unwrap_or_else(|_| "x86_64-w64-mingw32-ar".into());
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("third_party/shim");
        let c_obj = std::path::Path::new(&out).join("msvc_shim.o");
        let s_obj = std::path::Path::new(&out).join("msvc_shim_asm.o");
        for (src, obj) in [
            (dir.join("msvc_shim.c"), &c_obj),
            (dir.join("msvc_shim.S"), &s_obj),
        ] {
            if !src.exists() {
                panic!("missing shim source: {:?}", src);
            }
            let status = std::process::Command::new(&gcc)
                .args(["-c", "-O2", "-o"])
                .arg(obj)
                .arg(&src)
                .status()
                .unwrap_or_else(|e| panic!("failed to spawn cross gcc: {e}"));
            assert!(status.success(), "shim compile failed: {:?}", src);
        }
        let lib = std::path::Path::new(&out).join("libmsvc_shim.a");
        let _ = std::fs::remove_file(&lib);
        let status = std::process::Command::new(&ar)
            .arg("crs")
            .arg(&lib)
            .arg(&c_obj)
            .arg(&s_obj)
            .status()
            .unwrap_or_else(|e| panic!("failed to spawn cross ar: {e}"));
        assert!(status.success(), "shim archive failed");
        println!("cargo:rustc-link-search=native={}", out);
        println!("cargo:rustc-link-lib=static=msvc_shim");
    }

    tauri_build::build()
}
