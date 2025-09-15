import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { tauriNativeTransport, type EnhancedPortInfo } from '@/lib/serial/tauriNativeTransport';
import { Loader2 } from 'lucide-react';

/**
 * 原生Tauri串口选择器 - 完全无浏览器确认对话框
 *
 * 该组件完全摒弃Web Serial API，使用Tauri原生串口访问
 * 串口列表、连接、通信都不会触发浏览器安全确认
 */
interface NativeSerialPortSelectorProps {
  value?: string;
  onValueChange?: (value: string) => void;
  onOpenChange?: (isOpen: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  hideConnectedPorts?: boolean;
  connectedPorts?: string[];
  baudRate?: number;
}

export const NativeSerialPortSelector: React.FC<NativeSerialPortSelectorProps> = ({
  value,
  onValueChange,
  onOpenChange,
  placeholder = "选择串口设备",
  disabled = false,
  className = "",
  hideConnectedPorts = false,
  connectedPorts = [],
  baudRate = 9600
}) => {
  const { toast } = useToast();
  const [ports, setPorts] = useState<EnhancedPortInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  /**
   * 加载串口列表 - 无浏览器确认
   */
  const loadPorts = async (): Promise<void> => {
    if (disabled) return;

    setIsLoading(true);
    try {
      // 使用Tauri原生串口获取，完全绕过Web Serial API
      const enhancedPorts = await tauriNativeTransport.getSerialPorts();
      setPorts(enhancedPorts);

      if (enhancedPorts.length === 0) {
        toast({
          title: "未检测到串口设备",
          description: "请检查设备连接或驱动程序",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('加载Tauri原生串口列表失败:', error);
      toast({
        title: "串口检测失败",
        description: error instanceof Error ? error.message : "获取串口设备列表失败",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 处理下拉框打开事件
   */
  const handleOpenChange = async (isOpen: boolean): Promise<void> => {
    if (isOpen && !isLoading) {
      await loadPorts();
    }
    onOpenChange?.(isOpen);
  };

  /**
   * 处理选择变化
   */
  const handleValueChange = async (newValue: string): Promise<void> => {
    onValueChange?.(newValue);
  };

  /**
   * 获取端口显示名称
   */
  const getPortDisplayName = (port: EnhancedPortInfo): string => {
    return port.display_name;  // 格式: "(COM57) XR21V1412 USB UART Ch A"
  };

  /**
   * 过滤串口列表
   */
  const filteredPorts = ports.filter(port => {
    if (hideConnectedPorts && connectedPorts.includes(port.port_name)) {
      return false;
    }
    return true;
  });

  /**
   * 获取当前选中的端口信息
   */
  const getSelectedPortInfo = (): EnhancedPortInfo | null => {
    if (!value) return null;
    return ports.find(p => p.port_name === value) || null;
  };

  // 初始化
  useEffect(() => {
    if (!window.__TAURI__) {
      toast({
        title: "Tauri环境未检测到",
        description: "请使用Tauri桌面应用以获取最佳体验",
        variant: "destructive"
      });
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    loadPorts();
  }, []);

  if (!isSupported) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <SelectValue placeholder="Tauri环境未检测到" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">正在加载串口设备...</span>
          </div>
        ) : filteredPorts.length === 0 ? (
          <div className="text-center p-4 text-sm text-muted-foreground">
            <div>未检测到串口设备</div>
            <div className="text-xs mt-1">请检查设备是否已连接</div>
          </div>
        ) : (
          filteredPorts.map((port) => (
            <SelectItem key={port.port_name} value={port.port_name}>
              <div className="flex flex-col">
                <div className="font-medium">{getPortDisplayName(port)}</div>
                <div className="text-xs text-muted-foreground">
                  {port.manufacturer || 'Unknown Manufacturer'}
                </div>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
};