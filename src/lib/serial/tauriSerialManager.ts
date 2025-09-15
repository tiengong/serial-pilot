import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { SerialPortInfo as TransportPortInfo } from '@/lib/serial/transport';

// 增强的串口信息显示接口
export interface EnhancedSerialPortInfo {
  port_name: string;
  display_name: string;  // 格式: "(COM57) XR21V1412 USB UART Ch A"
  device_desc: string;
  manufacturer: string;
}

// 原生Tauri串口管理器 - 提供增强的串口显示
export class TauriSerialManager {
  private ports: EnhancedSerialPortInfo[] = [];
  private listeners: Set<(ports: EnhancedSerialPortInfo[]) => void> = new Set();

  /**
   * 获取增强的串口列表，包含设备友好名称
   */
  async getEnhancedSerialPorts(): Promise<EnhancedSerialPortInfo[]> {
    try {
      if (window.__TAURI__) {
        // 使用Tauri后端获取增强的串口信息
        this.ports = await invoke('get_enhanced_serial_ports');
      } else {
        // 非Tauri环境，回退到标准格式
        this.ports = await this.getFallbackPorts();
      }
      return this.ports;
    } catch (error) {
      console.error('获取增强串口列表失败:', error);
      this.ports = await this.getFallbackPorts();
      return this.ports;
    }
  }

  /**
   * 获取指定串口的详细信息
   */
  async getDeviceInfo(portName: string): Promise<EnhancedSerialPortInfo | null> {
    try {
      if (window.__TAURI__) {
        return await invoke('get_device_info', { portName });
      }
      return this.ports.find(p => p.port_name === portName) || null;
    } catch (error) {
      console.error('获取设备信息失败:', error);
      return null;
    }
  }

  /**
   * 获取串口完整信息
   */
  async getPortFullInfo(portName: string): Promise<Record<string, string>> {
    try {
      if (window.__TAURI__) {
        return await invoke('get_port_full_info', { portName });
      }
      return {
        port_name: portName,
        display_name: this.createDisplayName(portName, 'Unknown Device'),
        device_desc: 'Unknown Device',
        manufacturer: 'Unknown'
      };
    } catch (error) {
      console.error('获取完整端口信息失败:', error);
      return {
        port_name: portName,
        display_name: portName,
        device_desc: 'Unknown Device',
        manufacturer: 'Unknown'
      };
    }
  }

  /**
   * 创建显示名称 - 格式: (COM57) XR21V1412 USB UART Ch A
   */
  private createDisplayName(portName: string, deviceDesc: string): string {
    return `(${portName}) ${deviceDesc}`;
  }

  /**
   * 非Tauri环境的回退方案
   */
  private async getFallbackPorts(): Promise<EnhancedSerialPortInfo[]> {
    if (!navigator.serial) {
      return [];
    }

    try {
      // 通过Web Serial API获取端口信息
      const ports = await navigator.serial.getPorts();
      return ports.map((port, index) => {
        const portName = `COM${index + 1}`;
        const deviceDesc = `Serial Device ${index + 1}`;

        return {
          port_name: portName,
          display_name: this.createDisplayName(portName, deviceDesc),
          device_desc: deviceDesc,
          manufacturer: 'Unknown'
        };
      });
    } catch (error) {
      console.error('Web Serial API 失败:', error);
      return [];
    }
  }

  /**
   * 监听串口变化事件
   */
  async listenForPortChanges() {
    if (!window.__TAURI__) return;

    try {
      // 监听端口添加事件
      await listen('ports_added', (event) => {
        console.log('串口添加:', event.payload);
        this.refreshPorts();
      });

      // 监听端口移除事件
      await listen('ports_removed', (event) => {
        console.log('串口移除:', event.payload);
        this.refreshPorts();
      });

      // 监听串口数据事件
      await listen('serial_data', (event) => {
        const [portName, data] = event.payload as [string, string];
        console.log(`端口 ${portName} 接收到数据:`, data);
      });
    } catch (error) {
      console.error('监听串口事件失败:', error);
    }
  }

  /**
   * 刷新串口列表
   */
  private async refreshPorts() {
    await this.getEnhancedSerialPorts();
    this.notifyListeners();
  }

  /**
   * 添加监听器
   */
  addChangeListener(callback: (ports: EnhancedSerialPortInfo[]) => void) {
    this.listeners.add(callback);
  }

  /**
   * 移除监听器
   */
  removeChangeListener(callback: (ports: EnhancedSerialPortInfo[]) => void) {
    this.listeners.delete(callback);
  }

  /**
   * 通知监听器
   */
  private notifyListeners() {
    this.listeners.forEach(callback => callback(this.ports));
  }

  /**
   * 获取当前端口列表
   */
  getCurrentPorts(): EnhancedSerialPortInfo[] {
    return this.ports;
  }
}

// 创建单例实例
export const tauriSerialManager = new TauriSerialManager();