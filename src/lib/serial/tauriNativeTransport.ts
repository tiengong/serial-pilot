import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// 原生Tauri串口信息显示（完全无确认对话框）
export interface EnhancedPortInfo {
  port_name: string;
  display_name: string;  // (COM57) XR21V1412 USB UART Ch A
  port_type: string;
  description?: string;
  manufacturer?: string;
}

// 原生Tauri串口连接管理器 - 完全绕过浏览器确认
export class TauriNativeTransport {
  private connections = new Map<string, TauriSerialConnection>();
  private listeners = new Map<string, (data: string) => void>();
  private dataListeners: ((portName: string, data: string) => void)[] = [];

  constructor() {
    this.initializeDataListener();
  }

  isSupported(): boolean {
    return window.__TAURI__ !== undefined && window.__TAURI__.invoke !== undefined;
  }

  /**
   * 获取串口列表 - 完全无浏览器确认
   */
  async listPorts(): Promise<EnhancedPortInfo[]> {
    if (!this.isSupported()) throw new Error('Tauri环境未检测到');

    try {
      const ports = await invoke('get_native_serial_ports') as EnhancedPortInfo[];
      return ports.sort((a, b) => a.port_name.localeCompare(b.port_name));
    } catch (error) {
      console.error('获取原生串口列表失败:', error);
      return [];
    }
  }

  /**
   * 连接串口 - 完全无浏览器确认
   */
  async connect(
    port: EnhancedPortInfo,
    config: {
      baudRate: number;
      dataBits?: number;
      parity?: string;
      stopBits?: number;
    } = { baudRate: 9600 }
  ): Promise<TauriSerialConnection> {
    if (!this.isSupported()) throw new Error('Tauri环境未检测到');

    try {
      const success = await invoke('connect_native_serial_port', {
        portName: port.port_name,
        baudRate: config.baudRate,
        dataBits: config.dataBits || 8,
        parity: config.parity || 'none',
        stopBits: config.stopBits || 1
      });

      if (!success.includes('成功')) throw new Error(success);

      // 启动数据监听
      await invoke('start_native_serial_listener', { portName: port.port_name });

      const connection: TauriSerialConnection = {
        id: `tauri-${port.port_name}`,
        port: port,
        isOpen: true,
        write: (data: string) => this.writeData(port.port_name, data),
        close: () => this.disconnect(port.port_name),
        addDataListener: (callback) => this.addDataListener(port.port_name, callback),
        removeDataListener: (callback) => this.removeDataListener(port.port_name, callback),
      };

      this.connections.set(port.port_name, connection);
      console.log(`原生串口 ${port.port_name} 连接成功`);

      return connection;
    } catch (error) {
      console.error(`连接原生串口 ${port.port_name} 失败:`, error);
      throw error;
    }
  }

  /**
   * 断开串口连接
   */
  async disconnect(portName: string): Promise<void> {
    try {
      await invoke('disconnect_native_serial_port', { portName });
      this.connections.delete(portName);
      this.listeners.delete(portName);
      console.log(`原生串口 ${portName} 已断开`);
    } catch (error) {
      console.error(`断开原生串口 ${portName} 失败:`, error);
    }
  }

  /**
   * 写入数据到串口
   */
  async writeData(portName: string, data: string): Promise<void> {
    try {
      await invoke('write_native_serial_data', { portName, data });
    } catch (error) {
      console.error(`写入串口 ${portName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 添加数据监听器
   */
  addDataListener(portName: string, callback: (data: string) => void): void {
    if (!this.listeners.has(portName)) {
      this.listeners.set(portName, []);
    }
    this.listeners.get(portName)?.push(callback);
  }

  /**
   * 移除数据监听器
   */
  removeDataListener(portName: string, callback: (data: string) => void): void {
    const listeners = this.listeners.get(portName);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 初始化数据监听器
   */
  private async initializeDataListener(): Promise<void> {
    if (!this.isSupported()) return;

    try {
      await listen('native_serial_data', (event) => {
        const [portName, data] = event.payload as [string, string];
        this.notifyDataListeners(portName, data);
      });
    } catch (error) {
      console.error('初始化数据事件监听器失败:', error);
    }
  }

  /**
   * 通知数据监听器
   */
  private notifyDataListeners(portName: string, data: string): void {
    const listeners = this.listeners.get(portName);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error('数据监听器错误:', error);
        }
      });
    }
  }

  /**
   * 获取连接状态
   */
  isConnected(portName: string): boolean {
    return this.connections.has(portName);
  }

  /**
   * 获取当前活动连接
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * 断开所有连接
   */
  async disconnectAll(): Promise<void> {
    const connectedPorts = Array.from(this.connections.keys());
    for (const portName of connectedPorts) {
      await this.disconnect(portName);
    }
  }
}

// 串口连接接口
export interface TauriSerialConnection {
  id: string;
  port: EnhancedPortInfo;
  isOpen: boolean;
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
  addDataListener: (callback: (data: string) => void) => void;
  removeDataListener: (callback: (data: string) => void) => void;
}

// 创建全局实例
export const tauriNativeTransport = new TauriNativeTransport();