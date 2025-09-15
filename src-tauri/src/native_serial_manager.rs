use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

// 全局状态管理串口连接
lazy_static::lazy_static! {
    static ref SERIAL_CONNECTIONS: Arc<Mutex<HashMap<String, Box<dyn serialport::SerialPort>>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NativePortInfo {
    pub port_name: String,
    pub port_type: String,
    pub description: Option<String>,
    pub manufacturer: Option<String>,
    pub display_name: String, // (COM57) XR21V1412 USB UART Ch A
}

// 获取原生串口列表（带设备信息）
#[tauri::command]
pub fn get_native_serial_ports() -> Vec<NativePortInfo> {
    let mut ports_info = Vec::new();

    match serialport::available_ports() {
        Ok(ports) => {
            for port in ports {
                let mut description = String::new();
                let mut manufacturer = String::new();

                // 根据端口类型获取详细信息
                match &port.port_type {
                    serialport::SerialPortType::UsbPort(info) => {
                        if let Some(product) = &info.product {
                            description = product.clone();
                        }
                        if let Some(mfg) = &info.manufacturer {
                            manufacturer = mfg.clone();
                        }

                        if description.is_empty() {
                            description = format!("{} USB Serial Port", manufacturer);
                        }
                    }
                    serialport::SerialPortType::BluetoothPort => {
                        description = "Bluetooth Serial Port".to_string();
                    }
                    serialport::SerialPortType::PciPort => {
                        description = "PCI Serial Port".to_string();
                    }
                    _ => {
                        description = format!("Serial Port {}", port.port_name);
                    }
                }

                // 清理和格式化
                description = description.trim().to_string();
                if description.len() > 80 {
                    description = description[..80].to_string();
                }

                let display_name = format!("({}) {}", port.port_name, description);

                ports_info.push(NativePortInfo {
                    port_name: port.port_name.clone(),
                    port_type: format!("{:?}", port.port_type),
                    description: Some(description),
                    manufacturer: if !manufacturer.is_empty() { Some(manufacturer) } else { None },
                    display_name,
                });
            }
        }
        Err(e) => {
            eprintln!("获取串口列表失败: {}", e);
        }
    }

    // 按端口号排序
    ports_info.sort_by(|a, b| a.port_name.cmp(&b.port_name));
    ports_info
}

// 连接串口（完全绕过Web Serial API）
#[tauri::command]
pub fn connect_native_serial_port(
    port_name: String,
    baud_rate: u32,
    data_bits: u8,
    parity: String,
    stop_bits: u8,
) -> Result<String, String> {
    let parity_val = match parity.as_str() {
        "none" => serialport::Parity::None,
        "even" => serialport::Parity::Even,
        "odd" => serialport::Parity::Odd,
        _ => serialport::Parity::None,
    };

    let data_bits_val = match data_bits {
        5 => serialport::DataBits::Five,
        6 => serialport::DataBits::Six,
        7 => serialport::DataBits::Seven,
        8 => serialport::DataBits::Eight,
        _ => serialport::DataBits::Eight,
    };

    let stop_bits_val = match stop_bits {
        1 => serialport::StopBits::One,
        2 => serialport::StopBits::Two,
        _ => serialport::StopBits::One,
    };

    let timeout = Duration::from_millis(100);

    match serialport::new(&port_name, baud_rate)
        .parity(parity_val)
        .data_bits(data_bits_val)
        .stop_bits(stop_bits_val)
        .timeout(timeout)
        .open()
    {
        Ok(port) => {
            let mut connections = SERIAL_CONNECTIONS.lock().unwrap();
            connections.insert(port_name.clone(), port);
            Ok(format!("串口 {} 连接成功", port_name))
        }
        Err(e) => {
            Err(format!("连接串口 {} 失败: {}", port_name, e))
        }
    }
}

// 写入串口数据
#[tauri::command]
pub fn write_native_serial_data(port_name: String, data: String) -> Result<(), String> {
    let mut connections = SERIAL_CONNECTIONS.lock().unwrap();

    match connections.get_mut(&port_name) {
        Some(port) => {
            match port.write(data.as_bytes()) {
                Ok(_written) => Ok(()),
                Err(e) => Err(format!("写入串口 {} 失败: {}", port_name, e)),
            }
        }
        None => Err(format!("串口 {} 未连接", port_name)),
    }
}

// 断开串口连接
#[tauri::command]
pub fn disconnect_native_serial_port(port_name: String) -> Result<String, String> {
    let mut connections = SERIAL_CONNECTIONS.lock().unwrap();

    match connections.remove(&port_name) {
        Some(_port) => {
            // 串口会在Drop时自动关闭
            Ok(format!("串口 {} 已断开", port_name))
        }
        None => Err(format!("串口 {} 未找到", port_name)),
    }
}

// 开始监听串口数据
#[tauri::command]
pub fn start_native_serial_listener(app: tauri::AppHandle, port_name: String) -> Result<String, String> {
    let app_clone = app.clone();
    let port_name_clone = port_name.clone();

    std::thread::spawn(move || {
        let mut buffer = vec![0u8; 1024];

        loop {
            {
                let mut connections = SERIAL_CONNECTIONS.lock().unwrap();
                if let Some(port) = connections.get_mut(&port_name_clone) {
                    match port.read(&mut buffer) {
                        Ok(n) if n > 0 => {
                            let data = String::from_utf8_lossy(&buffer[..n]).to_string();

                            // 通过事件发送到前端
                            match app_clone.emit("native_serial_data", (port_name_clone.clone(), data)) {
                                Ok(_) => {},
                                Err(e) => {
                                    eprintln!("发送数据事件失败: {}", e);
                                }
                            }
                        }
                        Ok(0) => {
                            // 没有数据，稍作延迟
                            std::thread::sleep(Duration::from_millis(10));
                        }
                        Ok(_n) => {
                            // 有数据但可能是空或其他情况，继续处理
                            std::thread::sleep(Duration::from_millis(10));
                        }
                        Err(e) => {
                            if e.kind() != std::io::ErrorKind::WouldBlock {
                                eprintln!("读取串口 {} 错误: {}", port_name_clone, e);
                                break;
                            }
                            // 非阻塞错误，稍作延迟
                            std::thread::sleep(Duration::from_millis(10));
                        }
                    }
                } else {
                    // 串口已断开，停止监听
                    break;
                }
            }

            std::thread::sleep(Duration::from_millis(1));
        }
    });

    Ok(format!("开始监听串口 {} 数据", port_name))
}

// 获取所有连接状态
#[tauri::command]
pub fn get_native_connection_status() -> Vec<HashMap<String, String>> {
    let connections = SERIAL_CONNECTIONS.lock().unwrap();

    connections.keys()
        .map(|port_name| {
            let mut status = HashMap::new();
            status.insert("port_name".to_string(), port_name.clone());
            status.insert("status".to_string(), "connected".to_string());
            status.insert("connected".to_string(), "true".to_string());
            status
        })
        .collect()
}