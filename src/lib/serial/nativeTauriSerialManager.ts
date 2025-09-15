import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// 原生Tauri串口管理器 - 完全绕过Web Serial API
export class NativeTauriSerialManager {
  private currentPort: string | null = null;
  private connectedPorts: Set<string> = new Set();
  private listeners: Map<string, ((data: string) => void)[]> = new Map();
  private dataListeners: ((portName: string, data: string) => void)[] = [];
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    if (!window.__TAURI__) return;

    try {
      // 监听串口数据事件
      await listen('serial_data', (event) => {
        const [portName, data] = event.payload as [string, string];
        this.notifyDataListeners(portName, data);
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('初始化Tauri串口管理器失败:', error);
    }
  }

  /**
   * 获取增强的串口列表（无确认对话框）
   */
  async getSerialPorts(): Promise<EnhancedSerialPortInfo[]> {
    if (!window.__TAURI__) {
      throw new Error('Tauri环境未检测到');
    }

    try {
      const ports = await invoke('get_enhanced_serial_ports');
      return ports as EnhancedSerialPortInfo[];
    } catch (error) {
      console.error('获取串口列表失败:', error);
      return [];
    }
  }

  /**
   * 连接串口（无浏览器确认）
   */
  async connect(portName: string, baudRate: number = 9600): Promise<SerialPortConnection> {
    if (!window.__TAURI__) {
      throw new Error('Tauri环境未检测到');
    }

    try {
      // 使用Tauri原生串口连接
      await invoke('connect_serial_port', {
        portName,
        baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1
      });

      this.currentPort = portName;
      this.connectedPorts.add(portName);

      console.log(`串口 ${portName} 连接成功`);

      return {
        portName,
        isOpen: true,
        write: (data: string) => this.writeData(portName, data),
        read: () => this.readData(portName),
        close: () => this.disconnect(portName)
      };
    } catch (error) {
      console.error(`连接串口 ${portName} 失败:`, error);
      throw new Error(`连接失败: ${error}`);
    }
  }

  /**
   * 断开连接
   */
  async disconnect(portName: string = ''): Promise<void> {
    const targetPort = portName || this.currentPort;
    if (!targetPort) return;

    try {
      await invoke('disconnect_serial_port', { portName: targetPort });
      this.connectedPorts.delete(targetPort);
      this.listeners.delete(targetPort);

      if (this.currentPort === targetPort) {
        this.currentPort = null;
      }

      console.log(`串口 ${targetPort} 已断开`);
    } catch (error) {
      console.error(`断开串口 ${targetPort} 失败:`, error);
    }
  }

  /**
   * 写入数据到串口
   */
  async writeData(portName: string, data: string): Promise<void> {
    if (!window.__TAURI__) return;

    try {
      await invoke('write_serial_data', { portName, data });
    } catch (error) {
      console.error(`写入串口 ${portName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 读取串口数据（实时模式）
   */
  readData(portName?: string): string {
    // 使用事件监听，而不是直接读取
    return '';
  }

  /**
   * 获取连接状态
   */
  isConnected(portName?: string): boolean {
    return portName ? this.connectedPorts.has(portName) : !!this.currentPort;
  }

  /**
   * 获取当前连接列表
   */
  getConnectedPorts(): string[] {
    return Array.from(this.connectedPorts);
  }

  /**
   * 添加数据监听
   */
  addDataListener(callback: (portName: string, data: string) => void): void {
    this.dataListeners.push(callback);
  }

  /**
   * 移除数据监听
   */
  removeDataListener(callback: (portName: string, data: string) => void): void {
    const index = this.dataListeners.indexOf(callback);
    if (index > -1) {
      this.dataListeners.splice(index, 1);
    }
  }

  /**
   * 通知数据监听器
   */
  private notifyDataListeners(portName: string, data: string): void {
    this.dataListeners.forEach(listener => {
      try {
        listener(portName, data);
      } catch (error) {
        console.error('数据监听器错误:', error);
      }
    });
  }

  /**
   * 关闭所有连接
   */
  async disconnectAll(): Promise<void> {
    const ports = Array.from(this.connectedPorts);
    for (const portName of ports) {
      await this.disconnect(portName);
    }
  }
}

// 接口定义
export interface EnhancedSerialPortInfo {
  port_name: string;
  display_name: string;  // 格式: "(COM57) XR21V1412 USB UART Ch A"
  device_desc: string;
  manufacturer: string;
}

export interface SerialPortConnection {
  portName: string;
  isOpen: boolean;
  write: (data: string) => Promise<void>;
  read: () => string;
  close: () => Promise<void>;
}

// 创建单例实例
export const nativeTauriSerialManager = new NativeTauriSerialManager();