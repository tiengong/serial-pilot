import React, { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnhancedSerialPortInfo, tauriSerialManager } from '@/lib/serial/tauriSerialManager';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface EnhancedSerialPortSelectorProps {
  value?: string;
  onValueChange?: (value: string) => void;
  onOpenChange?: (isOpen: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  hideConnectedPorts?: boolean;
  connectedPorts?: string[];
}

export const EnhancedSerialPortSelector: React.FC<EnhancedSerialPortSelectorProps> = ({
  value,
  onValueChange,
  onOpenChange,
  placeholder = "选择串口设备",
  disabled = false,
  className = "",
  hideConnectedPorts = false,
  connectedPorts = []
}) => {
  const { toast } = useToast();
  const [ports, setPorts] = useState<EnhancedSerialPortInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);



  /**
   * 加载串口列表
   */
  const loadPorts = useCallback(async () => {
    if (disabled) return;

    setIsLoading(true);
    try {
      const enhancedPorts = await tauriSerialManager.getEnhancedSerialPorts();
      setPorts(enhancedPorts);

      if (enhancedPorts.length === 0) {
        toast({
          title: "未检测到串口设备",
          description: "请检查设备连接或驱动程序",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('加载串口列表失败:', error);
      toast({
        title: "加载串口失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [disabled, toast]);

  /**
   * 处理下拉框打开事件
   */
  const handleOpenChange = useCallback(async (isOpen: boolean) => {
    if (isOpen && !isLoading && ports.length === 0) {
      // 只有当列表为空时才重新加载
      await loadPorts();
    }

    if (isOpen && !isLoading) {
      setIsRefreshing(true);
      try {
        await loadPorts();
      } finally {
        setIsRefreshing(false);
      }
    }

    onOpenChange?.(isOpen);
  }, [onOpenChange, isLoading, ports.length, loadPorts]);

  /**
   * 处理选择变化
   */
  const handleValueChange = useCallback((newValue: string) => {
    onValueChange?.(newValue);
  }, [onValueChange]);

  /**
   * 获取指定端口的显示名称
   */
  const getPortDisplayName = (port: EnhancedSerialPortInfo): string => {
    return port.display_name; // 格式: "(COM57) XR21V1412 USB UART Ch A"
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

  // 初始化加载串口
  useEffect(() => {
    loadPorts();

    // 监听串口变化事件
    tauriSerialManager.listenForPortChanges();

    // 添加变化监听器
    const handlePortsChange = () => {
      loadPorts();
    };

    tauriSerialManager.addChangeListener(handlePortsChange);

    return () => {
      tauriSerialManager.removeChangeListener(handlePortsChange);
    };
  }, [loadPorts]);

  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder || "选择串口设备"} />
      </SelectTrigger>
      <SelectContent>
        {isLoading || isRefreshing ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">正在扫描串口设备...</span>
          </div>
        ) : filteredPorts.length === 0 ? (
          <div className="text-center p-4 text-sm text-muted-foreground">
            <div>未检测到串口设备</div>
            <div className="text-xs mt-1">请检查设备连接</div>
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