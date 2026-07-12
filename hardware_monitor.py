import sys
import math
import threading
import logging
from pathlib import Path

logger = logging.getLogger("ai-hw-checker.hw")

_SCRIPT_DIR = Path(__file__).parent
_CANDIDATE_DIRS = [
    _SCRIPT_DIR / "librehardware",   # 本專案 librehardware\ 目錄（最優先）
    _SCRIPT_DIR / "lib" / "lhm_extracted" / "runtimes" / "win-x64" / "lib" / "net10.0",
    _SCRIPT_DIR.parent / "lib" / "lhm_extracted" / "runtimes" / "win-x64" / "lib" / "net10.0",
    Path(r"C:\Users\Administrator\Documents\New OpenCode Project\lib\lhm_extracted\runtimes\win-x64\lib\net10.0"),
]
DLL_DIR = None
for _d in _CANDIDATE_DIRS:
    if _d.exists():
        DLL_DIR = _d
        break
if DLL_DIR is None:
    raise RuntimeError("LibreHardwareMonitor DLLs not found in any known location")
sys.path.insert(0, str(DLL_DIR))

import pythonnet
# Only load coreclr if the path indicates .NET Core/Modern .NET (e.g. net10.0)
if "net10.0" in str(DLL_DIR).lower() or "win-x64" in str(DLL_DIR).lower():
    try:
        pythonnet.load("coreclr")
    except Exception as e:
        logger.warning("Failed to load coreclr runtime: %s", e)

import clr

for dll in DLL_DIR.glob("*.dll"):
    try:
        clr.AddReference(str(dll))
    except Exception:
        pass

from LibreHardwareMonitor.Hardware import Computer, HardwareType, SensorType


_HW_TYPE_MAP = {
    HardwareType.Cpu: "CPU",
    HardwareType.GpuNvidia: "GPU (NVIDIA)",
    HardwareType.GpuAmd: "GPU (AMD)",
    HardwareType.GpuIntel: "GPU (Intel)",
    HardwareType.Memory: "RAM",
    HardwareType.Motherboard: "Motherboard",
    HardwareType.Storage: "Storage",
    HardwareType.Network: "Network",
    HardwareType.SuperIO: "Super I/O",
    HardwareType.Psu: "PSU",
}
try:
    _HW_TYPE_MAP[HardwareType.StorageController] = "Storage Controller"
except AttributeError:
    pass

_SENSOR_UNITS = {
    SensorType.Temperature: "°C",
    SensorType.Load: "%",
    SensorType.Clock: "MHz",
    SensorType.Fan: "RPM",
    SensorType.Flow: "L/h",
    SensorType.Control: "%",
    SensorType.Level: "%",
    SensorType.Voltage: "V",
    SensorType.Power: "W",
    SensorType.Data: "GB",
    SensorType.SmallData: "MB",
    SensorType.Throughput: "B/s",
    SensorType.Current: "A",
    SensorType.Energy: "mWh",
    SensorType.Noise: "dBA",
    SensorType.Humidity: "%",
}


class HardwareMonitor:
    def __init__(self):
        self._lock = threading.Lock()
        self.computer = Computer()
        self.computer.IsCpuEnabled = True
        self.computer.IsGpuEnabled = True
        self.computer.IsMemoryEnabled = True
        self.computer.IsMotherboardEnabled = True
        self.computer.IsStorageEnabled = False
        self.computer.IsNetworkEnabled = True
        self.computer.IsControllerEnabled = True
        self.computer.IsPowerMonitorEnabled = True
        self.computer.Open()

    def _update(self):
        for hw in self.computer.Hardware:
            hw.Update()
            for sub in hw.SubHardware:
                sub.Update()

    @staticmethod
    def _safe_float(val):
        if val is None:
            return None
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 2)

    @staticmethod
    def _hw_type_name(hw_type):
        return _HW_TYPE_MAP.get(hw_type, str(hw_type))

    @staticmethod
    def _get_unit(sensor_type):
        return _SENSOR_UNITS.get(sensor_type, "")

    def _sensor_to_dict(self, sensor):
        return {
            "name": str(sensor.Name),
            "type": str(sensor.SensorType),
            "value": self._safe_float(sensor.Value),
            "min": self._safe_float(sensor.Min),
            "max": self._safe_float(sensor.Max),
            "unit": self._get_unit(sensor.SensorType),
        }

    def _get_synthetic_storage(self):
        try:
            from System.IO import DriveInfo
            drives = DriveInfo.GetDrives()
            synthetic_hw = []
            for drive in drives:
                try:
                    if not drive.IsReady:
                        continue
                    name = str(drive.Name)
                    total_gb = self._safe_float(drive.TotalSize / (1024**3))
                    free_gb = self._safe_float(drive.TotalFreeSpace / (1024**3))
                    if total_gb is None or free_gb is None:
                        continue
                    used_gb = self._safe_float(total_gb - free_gb)
                    load_percent = self._safe_float((used_gb / total_gb) * 100) if total_gb > 0 else 0.0

                    clean_name = name.replace(":\\", "").replace(":/", "").lower()
                    hw_info = {
                        "name": f"Local Disk ({name.strip()})",
                        "type": "Storage",
                        "identifier": f"/storage/synthetic_{clean_name}",
                        "sensors": [
                            {
                                "name": "Used Space",
                                "type": "Data",
                                "value": used_gb,
                                "min": None,
                                "max": None,
                                "unit": "GB",
                            },
                            {
                                "name": "Total Space",
                                "type": "Data",
                                "value": total_gb,
                                "min": None,
                                "max": None,
                                "unit": "GB",
                            },
                            {
                                "name": "Space Usage",
                                "type": "Load",
                                "value": load_percent,
                                "min": None,
                                "max": None,
                                "unit": "%",
                            }
                        ],
                        "sub_hardware": [],
                    }
                    synthetic_hw.append(hw_info)
                except Exception as e:
                    logger.warning("Failed to process drive info for a drive: %s", e)
            return synthetic_hw
        except Exception as e:
            logger.warning("Failed to query DriveInfo: %s", e)
            return []

    def get_all_hardware(self):
        with self._lock:
            self._update()
            result = []
            for hw in self.computer.Hardware:
                hw_info = {
                    "name": str(hw.Name),
                    "type": self._hw_type_name(hw.HardwareType),
                    "identifier": str(hw.Identifier),
                    "sensors": [],
                    "sub_hardware": [],
                }
                for sensor in hw.Sensors:
                    if sensor.Value is not None:
                        hw_info["sensors"].append(self._sensor_to_dict(sensor))

                for sub in hw.SubHardware:
                    sub_info = {
                        "name": str(sub.Name),
                        "type": self._hw_type_name(sub.HardwareType),
                        "sensors": [],
                    }
                    for sensor in sub.Sensors:
                        if sensor.Value is not None:
                            sub_info["sensors"].append(self._sensor_to_dict(sensor))
                    hw_info["sub_hardware"].append(sub_info)

                result.append(hw_info)
            result.extend(self._get_synthetic_storage())
            return result


    def get_hardware_and_summary(self):
        with self._lock:
            self._update()
            all_hw = []
            for hw in self.computer.Hardware:
                hw_info = {
                    "name": str(hw.Name),
                    "type": self._hw_type_name(hw.HardwareType),
                    "identifier": str(hw.Identifier),
                    "sensors": [],
                    "sub_hardware": [],
                }
                for sensor in hw.Sensors:
                    if sensor.Value is not None:
                        hw_info["sensors"].append(self._sensor_to_dict(sensor))
                for sub in hw.SubHardware:
                    sub_info = {"name": str(sub.Name), "type": self._hw_type_name(sub.HardwareType), "sensors": []}
                    for sensor in sub.Sensors:
                        if sensor.Value is not None:
                            sub_info["sensors"].append(self._sensor_to_dict(sensor))
                    hw_info["sub_hardware"].append(sub_info)
                all_hw.append(hw_info)

            all_hw.extend(self._get_synthetic_storage())
            summary = self._build_summary_from_hw(all_hw)
            return all_hw, summary

    def _build_summary_from_hw(self, all_hw):
        summary = {
            "cpu": {"name": "", "temperature": None, "load": None, "clock": None, "power": None, "voltage": None},
            "gpu": {"name": "", "temperature": None, "load": None, "clock": None, "power": None, "vram_usage": None, "vram_total": None, "fan_speed": None},
            "ram": {"name": "", "total": None, "used": None, "load": None},
            "storage": [],
            "network": [],
        }
        for hw in all_hw:
            ht = hw["type"]
            if ht == "CPU":
                summary["cpu"]["name"] = hw["name"]
                for s in hw["sensors"]:
                    v = s["value"]
                    if v is None:
                        continue
                    n = s["name"].lower()
                    if s["type"] == "Temperature" and "package" in n:
                        summary["cpu"]["temperature"] = v
                    elif s["type"] == "Load" and "total" in n:
                        summary["cpu"]["load"] = v
                    elif s["type"] == "Clock" and "core #1" in n:
                        summary["cpu"]["clock"] = v
                    elif s["type"] == "Power" and "package" in n:
                        summary["cpu"]["power"] = v
                    elif s["type"] == "Voltage" and "package" in n:
                        summary["cpu"]["voltage"] = v
                if summary["cpu"]["temperature"] is None:
                    for s in hw["sensors"]:
                        if s["type"] == "Temperature" and s["value"] is not None:
                            summary["cpu"]["temperature"] = s["value"]
                            break
                if summary["cpu"]["load"] is None:
                    for s in hw["sensors"]:
                        if s["type"] == "Load" and s["value"] is not None:
                            summary["cpu"]["load"] = s["value"]
                            break

            elif ht.startswith("GPU"):
                summary["gpu"]["name"] = hw["name"]
                for s in hw["sensors"]:
                    v = s["value"]
                    if v is None:
                        continue
                    n = s["name"].lower()
                    if s["type"] == "Temperature" and "core" in n:
                        summary["gpu"]["temperature"] = v
                    elif s["type"] == "Load" and "core" in n:
                        summary["gpu"]["load"] = v
                    elif s["type"] == "Clock" and "core" in n:
                        summary["gpu"]["clock"] = v
                    elif s["type"] == "Power":
                        summary["gpu"]["power"] = v
                    elif s["type"] == "Fan":
                        summary["gpu"]["fan_speed"] = v
                    elif s["type"] == "Data" and "memory used" in n:
                        summary["gpu"]["vram_usage"] = v
                    elif s["type"] == "Data" and "memory total" in n:
                        summary["gpu"]["vram_total"] = v
                    elif s["type"] == "SmallData" and "memory used" in n:
                        summary["gpu"]["vram_usage"] = v
                    elif s["type"] == "SmallData" and "memory total" in n:
                        summary["gpu"]["vram_total"] = v
                if summary["gpu"]["temperature"] is None:
                    for s in hw["sensors"]:
                        if s["type"] == "Temperature" and s["value"] is not None:
                            summary["gpu"]["temperature"] = s["value"]
                            break
                if summary["gpu"]["load"] is None:
                    for s in hw["sensors"]:
                        if s["type"] == "Load" and s["value"] is not None:
                            summary["gpu"]["load"] = s["value"]
                            break

            elif ht == "RAM":
                summary["ram"]["name"] = hw["name"]
                for s in hw["sensors"]:
                    v = s["value"]
                    if v is None:
                        continue
                    n = s["name"].lower()
                    if s["type"] == "Data" and "used" in n:
                        summary["ram"]["used"] = v
                    elif s["type"] == "Data" and "total" in n:
                        summary["ram"]["total"] = v
                    elif s["type"] == "Load":
                        summary["ram"]["load"] = v

            elif ht == "Storage":
                info = {"name": hw["name"], "temperature": None, "load": None, "usage": None, "total": None, "used": None}
                for s in hw["sensors"]:
                    v = s["value"]
                    if v is None:
                        continue
                    if s["type"] == "Temperature":
                        info["temperature"] = v
                    elif s["type"] == "Load":
                        info["load"] = v
                    elif s["type"] == "Data" and "used" in s["name"].lower():
                        info["usage"] = v
                        info["used"] = v
                    elif s["type"] == "Data" and "total" in s["name"].lower():
                        info["total"] = v
                summary["storage"].append(info)

            elif ht == "Network":
                net = {"name": hw["name"], "throughput_up": None, "throughput_down": None}
                for s in hw["sensors"]:
                    v = s["value"]
                    if v is None:
                        continue
                    if s["type"] == "Throughput":
                        val_mb = round(v / 1048576, 2)
                        n = s["name"].lower()
                        if "up" in n:
                            net["throughput_up"] = val_mb
                        elif "down" in n:
                            net["throughput_down"] = val_mb
                summary["network"].append(net)

        if summary["ram"]["total"] is None and summary["ram"]["used"] is not None:
            for hw in all_hw:
                if hw["type"] == "RAM":
                    for s in hw["sensors"]:
                        if s["type"] == "Data" and "available" in s["name"].lower() and s["value"] is not None:
                            summary["ram"]["total"] = round(summary["ram"]["used"] + s["value"], 2)
                            break
                    if summary["ram"]["total"] is not None:
                        break

        return summary

    def close(self):
        try:
            self.computer.Close()
        except Exception:
            pass


_singleton = None
_singleton_lock = threading.Lock()


def get_monitor():
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = HardwareMonitor()
    return _singleton
