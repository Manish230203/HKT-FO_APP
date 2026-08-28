import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MapPin, Navigation, Battery, RefreshCw, Radio, Search, Filter, History, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api from "@/services/api";

export default function LiveGPSTracking() {
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedOfficer, setSelectedOfficer] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const fetchLiveLocations = async () => {
    try {
      const res = await api.get("/gps/live");
      if (res.data && res.data.officers) {
        setOfficers(res.data.officers);
        if (!selectedOfficer && res.data.officers.length > 0) {
          setSelectedOfficer(res.data.officers[0]);
        }
      }
      setLastSyncTime(new Date());
    } catch (err) {
      console.error("Error fetching live locations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveLocations();
    const interval = setInterval(fetchLiveLocations, 15000); // 15s polling fallback

    // Connect WebSocket for real-time live location push
    let socket = null;
    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const apiHost = (api.defaults.baseURL || window.location.origin).replace(/^https?:\/\//, "");
      const wsUrl = `${wsProtocol}//${apiHost}/gps/ws/live`;
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "LOCATION_UPDATE") {
            fetchLiveLocations();
          }
        } catch (e) {}
      };
    } catch (wsErr) {
      console.warn("WebSocket live connect issue:", wsErr);
    }

    return () => {
      clearInterval(interval);
      if (socket) socket.close();
    };
  }, []);

  const filteredOfficers = officers.filter((off) => {
    const matchesSearch =
      (off.employee_name && off.employee_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (off.employee_code && off.employee_code.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || off.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "MOVING":
        return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">MOVING</Badge>;
      case "STAY":
        return <Badge className="bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20">STAY</Badge>;
      case "IDLE":
        return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">IDLE</Badge>;
      default:
        return <Badge className="bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20">OFFLINE</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 dark:bg-slate-900 border border-slate-800 p-5 rounded-2xl text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight">Area Manager Live GPS Tracking</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time movement monitoring & adaptive location streaming for Field Officers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={fetchLiveLocations}
            variant="outline"
            size="sm"
            className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-xs h-9"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          {lastSyncTime && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Updated {lastSyncTime.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-card border border-border p-3.5 rounded-xl shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search officer name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1 shrink-0" />
          {["ALL", "MOVING", "STAY", "IDLE", "OFFLINE"].map((st) => (
            <Button
              key={st}
              variant={statusFilter === st ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(st)}
              className="text-xs h-8 px-3 rounded-lg"
            >
              {st}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Grid: Officers List & Selected Detail Map View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Officers List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Active Officers ({filteredOfficers.length})
          </h2>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-xs">Loading live locations...</div>
          ) : filteredOfficers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs bg-card border rounded-xl">
              No field officers found matching criteria.
            </div>
          ) : (
            filteredOfficers.map((off) => {
              const isSelected = selectedOfficer?.employee_id === off.employee_id;
              return (
                <Card
                  key={off.employee_id}
                  onClick={() => setSelectedOfficer(off)}
                  className={`cursor-pointer transition-all duration-200 border ${
                    isSelected
                      ? "border-sky-500 bg-sky-500/5 dark:bg-sky-950/20 shadow-md"
                      : "hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">{off.employee_name}</span>
                        <span className="text-xs text-muted-foreground">({off.employee_code})</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-sky-500" />
                          {off.latitude?.toFixed(4)}, {off.longitude?.toFixed(4)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Navigation className="h-3 w-3 text-emerald-500" />
                          {off.speed ? `${(off.speed * 3.6).toFixed(1)} km/h` : "0 km/h"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {getStatusBadge(off.status)}
                      <span className="text-[10px] text-muted-foreground">{off.mins_ago}m ago</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Selected Officer Detail & Map Visualizer (7 cols) */}
        <div className="lg:col-span-7">
          {selectedOfficer ? (
            <Card className="border border-border shadow-lg">
              <CardHeader className="p-4 border-b border-border bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      {selectedOfficer.employee_name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Emp Code: {selectedOfficer.employee_code} | Status: {selectedOfficer.status}
                    </p>
                  </div>
                  <Link
                    to={`/gps/history?employee_id=${selectedOfficer.employee_id}&date=${new Date().toISOString().split("T")[0]}`}
                  >
                    <Button variant="outline" size="sm" className="text-xs h-8">
                      <History className="h-3.5 w-3.5 mr-1" /> View Track History
                    </Button>
                  </Link>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl">
                    <span className="text-[11px] text-muted-foreground block">Latitude</span>
                    <span className="text-sm font-semibold text-foreground">{selectedOfficer.latitude?.toFixed(5)}</span>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl">
                    <span className="text-[11px] text-muted-foreground block">Longitude</span>
                    <span className="text-sm font-semibold text-foreground">{selectedOfficer.longitude?.toFixed(5)}</span>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl">
                    <span className="text-[11px] text-muted-foreground block">Accuracy</span>
                    <span className="text-sm font-semibold text-foreground">
                      {selectedOfficer.accuracy ? `${selectedOfficer.accuracy.toFixed(0)} meters` : "N/A"}
                    </span>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl">
                    <span className="text-[11px] text-muted-foreground block">Battery</span>
                    <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                      <Battery className="h-3.5 w-3.5 text-emerald-500" />
                      {selectedOfficer.battery_level ? `${selectedOfficer.battery_level}%` : "100%"}
                    </span>
                  </div>
                </div>

                {/* Visual Location Radar Map Box */}
                <div className="relative h-64 bg-slate-950 rounded-2xl border border-slate-800 p-4 flex flex-col items-center justify-center overflow-hidden">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:24px_24px] opacity-40"></div>
                  
                  {/* Center Radar Pulse */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute h-24 w-24 rounded-full bg-sky-500/20 animate-ping"></div>
                      <div className="h-12 w-12 rounded-full bg-sky-500/30 border border-sky-400 flex items-center justify-center shadow-lg">
                        <MapPin className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <span className="mt-3 text-xs font-medium text-slate-300 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700">
                      Live Coordinate Pin: {selectedOfficer.latitude?.toFixed(4)}, {selectedOfficer.longitude?.toFixed(4)}
                    </span>
                  </div>

                  <div className="absolute bottom-3 right-3 text-[10px] text-slate-500 bg-slate-900/90 px-2 py-1 rounded border border-slate-800">
                    Adaptive GPS Threshold Mode
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-20 text-muted-foreground text-xs bg-card border rounded-2xl">
              Select an officer from the left to view live position details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
