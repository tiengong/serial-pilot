// Console window configuration for debugging
// Always show console in debug mode, optionally in release with "console" feature
#![cfg_attr(all(not(debug_assertions), not(feature = "console")), windows_subsystem = "windows")]

use std::env;
use std::panic;
use tauri::Manager;
use chrono::Utc;

// 导入串口工具模块
mod serial_utils;
// 导入原生串口管理器
mod native_serial_manager;

fn main() {
    // Set up panic hook for better error reporting
    panic::set_hook(Box::new(|panic_info| {
        let payload = panic_info.payload();
        let message = if let Some(s) = payload.downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };

        let location = panic_info.location()
            .map(|l| format!(" at {}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_default();

        eprintln!("PANIC: {}{}", message, location);
        log::error!("PANIC: {}{}", message, location);
    }));

    // 根据构建模式设置日志级别和输出
    let is_debug = cfg!(debug_assertions);
    let _log_level = if is_debug {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Warn
    };

    if is_debug {
        log::info!("Starting Serial Pilot application (Debug Mode)...");
    }

    log::info!("Tauri native serial manager initialized successfully");

    // Read environment variables for plugin control
    let _enable_window_state = env::var("SP_ENABLE_WINDOW_STATE")
        .unwrap_or_else(|_| "0".to_string()) == "1";

    let _enable_serial = env::var("SP_ENABLE_SERIAL")
        .unwrap_or_else(|_| "1".to_string()) == "1";
    // Set up panic hook for better error reporting
    panic::set_hook(Box::new(|panic_info| {
        let payload = panic_info.payload();
        let message = if let Some(s) = payload.downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        
        let location = panic_info.location()
            .map(|l| format!(" at {}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_default();
            
        eprintln!("PANIC: {}{}", message, location);
        log::error!("PANIC: {}{}", message, location);
    }));

    // 根据构建模式设置日志级别和输出
    let is_debug = cfg!(debug_assertions);
    let log_level = if is_debug {
        log::LevelFilter::Debug
    } else {
        // Release模式只显示重要日志
        log::LevelFilter::Warn
    };

    if is_debug {
        log::info!("Starting Serial Pilot application (Debug Mode)...");
    }
    
    // Read environment variables for plugin control
    let enable_window_state = env::var("SP_ENABLE_WINDOW_STATE")
        .unwrap_or_else(|_| "0".to_string()) == "1";
    let enable_serial = env::var("SP_ENABLE_SERIAL")
        .unwrap_or_else(|_| "1".to_string()) == "1";
    
    if is_debug {
        log::info!("Window state plugin: {}", if enable_window_state { "enabled" } else { "disabled" });
        log::info!("Serial plugin: {}", if enable_serial { "enabled" } else { "disabled" });
    }

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log_level)
            .targets([
                // Debug模式输出到控制台和文件，Release模式只输出到文件
                if is_debug {
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout)
                } else {
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: Some("app.log".to_string()) })
                },
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
            ])
            .build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            if is_debug {
                log::info!("Setting up main window...");
            }
            
            // Get the main window and ensure it's visible
            if let Some(window) = app.get_webview_window("main") {
                if is_debug {
                    log::info!("Main window found, configuring...");
                }
                
                // Force window to be visible and focused
                if let Err(e) = window.show() {
                    if is_debug {
                        log::warn!("Failed to show window: {}", e);
                    }
                }
                
                if let Err(e) = window.set_focus() {
                    if is_debug {
                        log::warn!("Failed to focus window: {}", e);
                    }
                }
                
                if let Err(e) = window.center() {
                    if is_debug {
                        log::warn!("Failed to center window: {}", e);
                    }
                }
                
                // Set a safe default size
                if let Err(e) = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 1200, height: 800 })) {
                    if is_debug {
                        log::warn!("Failed to set window size: {}", e);
                    }
                }
                
                if is_debug {
                    log::info!("Main window setup completed");
                }
            } else {
                if is_debug {
                    log::error!("Main window not found! Attempting to create fallback window...");
                }
                
                // Fallback: create main window if not found
                match app.handle().get_webview_window("main").or_else(|| {
                    if is_debug {
                        log::info!("Creating fallback main window...");
                    }
                    tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                        .title("Serial Pilot")
                        .inner_size(1200.0, 800.0)
                        .min_inner_size(800.0, 600.0)
                        .center()
                        .build()
                        .map_err(|e| log::error!("Failed to create fallback window: {}", e))
                        .ok()
                }) {
                    Some(window) => {
                        log::info!("Fallback window created successfully");
                        if let Err(e) = window.show() {
                            log::warn!("Failed to show fallback window: {}", e);
                        }
                    }
                    None => {
                        log::error!("Failed to create fallback window!");
                    }
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 串口增强信息命令
            serial_utils::get_enhanced_serial_ports,
            serial_utils::get_device_info,
            serial_utils::get_port_full_info,
            // 原生串口管理命令（完全绕过Web Serial API）
            native_serial_manager::get_native_serial_ports,
            native_serial_manager::connect_native_serial_port,
            native_serial_manager::write_native_serial_data,
            native_serial_manager::disconnect_native_serial_port,
            native_serial_manager::start_native_serial_listener,
            native_serial_manager::get_native_connection_status
        ]);

    // Conditionally add window state plugin
    if enable_window_state {
        log::info!("Adding window state plugin...");
        builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
        log::info!("Window state plugin added");
    }

    // Conditionally add serial plugin (支持所有平台)
    if enable_serial {
        log::info!("Adding serial plugin...");
        
        // 使用tauri-plugin-serialplugin，支持所有平台
        match tauri_plugin_serialplugin::init() {
            plugin => {
                log::info!("Serial plugin initialized successfully");
                builder = builder.plugin(plugin);
            }
        }
    }

    log::info!("Running Tauri application...");
    match builder.run(tauri::generate_context!()) {
        Ok(_) => log::info!("Application exited normally"),
        Err(e) => {
            let error_msg = format!("Application startup failed: {}\n\nTimestamp: {}\nPlatform: {}\nArchitecture: {}", 
                e, 
                Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            
            log::error!("Application failed to run: {}", e);
            eprintln!("FATAL ERROR: {}", e);
            
            // Write startup error to file for troubleshooting
            if let Ok(exe_path) = std::env::current_exe() {
                if let Some(exe_dir) = exe_path.parent() {
                    let error_file = exe_dir.join("startup-error.txt");
                    if let Err(write_err) = std::fs::write(&error_file, &error_msg) {
                        eprintln!("Failed to write startup error to file: {}", write_err);
                    } else {
                        eprintln!("Startup error written to: {}", error_file.display());
                    }
                }
            }
            
            panic!("Application startup failed: {}", e);
        }
    }
}