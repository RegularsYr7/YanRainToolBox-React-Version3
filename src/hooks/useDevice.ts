/**
 * 设备管理 Hook
 *
 * 提供设备上下文的使用Hook
 *
 * @hook useDevice
 * @description 设备状态管理Hook
 * @author YanRain ToolBox Team
 */

import { useContext } from "react";
import DeviceContext from "../Context/DeviceContext";

/**
 * 使用设备上下文的Hook
 */
export const useDevice = () => {
  const context = useContext(DeviceContext);
  if (context === undefined) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return context;
};
