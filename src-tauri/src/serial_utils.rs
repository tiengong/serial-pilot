use serde::{Deserialize, Serialize};
use winreg::RegKey;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SerialPortDisplay {
    pub port_name: String,
    pub display_name: String,  // 格式: "(COM57) XR21V1412 USB UART Ch A"
    pub device_desc: String,    // 原始设备描述
    pub manufacturer: String,
}

// 获取当前所有串口列表（与设备管理器一致且格式化显示）
#[tauri::command]
pub fn get_enhanced_serial_ports() -> Vec<SerialPortDisplay> {
    let mut displays = Vec::new();

    // 获取所有串口基信息
    let com_ports = match serialport::available_ports() {
        Ok(ports) => ports,
        Err(e) => {
            eprintln!("获取串口列表失败: {}", e);
            return displays;
        }
    };

    // Windows注册表路径
    let hklm = RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE);

    for port_info in com_ports {
        let _com_num = port_info.port_name
            .trim_start_matches("COM")
            .parse::<u32>()
            .unwrap_or(0);

        let mut device_desc = String::new();
        let mut manufacturer = String::new();

        // 从USB设备信息获取友好名称
        if let serialport::SerialPortType::UsbPort(info) = &port_info.port_type {
            if let Some(product) = &info.product {
                device_desc = product.clone();
            } else if let Some(mfg) = &info.manufacturer {
                device_desc = format!("{} USB Serial Port", mfg);
                manufacturer = mfg.clone();
            } else {
                device_desc = "USB Serial Port".to_string();
            }

            // 从USB信息获取制造商
            if let Some(mfg) = &info.manufacturer {
                manufacturer = mfg.clone();
            }
        } else if let serialport::SerialPortType::BluetoothPort = &port_info.port_type {
            device_desc = "Bluetooth Serial Port".to_string();
        } else if let serialport::SerialPortType::PciPort = &port_info.port_type {
            device_desc = "PCI Serial Port".to_string();
        } else {
            // 从注册表获取基本串口描述
            if let Ok(ports_key) = hklm.open_subkey("HARDWARE\\DEVICEMAP\\SERIALCOMM") {
                // 遍历注册表寻找匹配
                for item in ports_key.enum_values() {
                    if let Ok((value_name, _reg_value)) = item {
                        if let Ok(com_name) = ports_key.get_value::<String, _>(&value_name) {
                            if com_name == port_info.port_name {
                                // 使用值名作为设备描述
                                let desc = value_name.replace("\\Device\\", "");
                                if !desc.is_empty() && desc.len() < 50 {
                                    device_desc = desc.clone();
                                }
                                break;
                            }
                        }
                    }
                }
            }

            // 如果还是找不到，使用通用描述
            if device_desc.is_empty() {
                device_desc = format!("Serial Port {}", port_info.port_name);
            }
        }

        // 清理设备描述
        device_desc = device_desc.trim().to_string();
        if device_desc.len() > 80 {
            device_desc = device_desc[..80].to_string() + "...";
        }

        // 构建显示名称: (COM57) XR21V1412 USB UART Ch A
        let display_name = format!("({}) {}", port_info.port_name, device_desc);

        displays.push(SerialPortDisplay {
            port_name: port_info.port_name.clone(),
            display_name,
            device_desc,
            manufacturer,
        });
    }

    displays.sort_by(|a, b| a.port_name.cmp(&b.port_name));
    displays
}

// 获取特定设备信息的辅助函数
#[tauri::command]
pub fn get_device_info(port_name: &str) -> Option<SerialPortDisplay> {
    let displays = get_enhanced_serial_ports();
    displays.into_iter().find(|d| d.port_name == port_name)
}

// 获取指定设备的详细信息
#[tauri::command]
pub fn get_port_full_info(port_name: &str) -> Result<HashMap<String, String>, String> {
    let mut info = HashMap::new();

    // 基本端口信息
    info.insert("port_name".to_string(), port_name.to_string());

    // 使用增强的端口检测
    if let Some(display_info) = get_device_info(port_name) {
        info.insert("display_name".to_string(), display_info.display_name);
        info.insert("device_desc".to_string(), display_info.device_desc);
        info.insert("manufacturer".to_string(), display_info.manufacturer);
    } else {
        info.insert("display_name".to_string(), port_name.to_string());
        info.insert("device_desc".to_string(), format!("Serial Port {}", port_name));
        info.insert("manufacturer".to_string(), "Unknown".to_string());
    }

    Ok(info)
}