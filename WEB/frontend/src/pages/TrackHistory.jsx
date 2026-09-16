import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { 
  History, Calendar, MapPin, Navigation, ArrowLeft, Clock, 
  ShieldCheck, ShieldAlert, Play, Pause, RotateCcw, Zap, Layers, AlertCircle 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api, { getDutyLocationViolations } from "@/services/api";

const LeafletMap = ({ data, activeSegmentId, isPlaying, currentPlaybackPos }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const playbackMarkerRef = useRef(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    if (!window.L) {
      if (!document.getElementById("leaflet-js")) {
        const script = document.createElement("script");
        script.id = "leaflet-js";
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => setLeafletLoaded(true);
        document.head.appendChild(script);
      } else {
        const checkL = setInterval(() => {
          if (window.L) {
            setLeafletLoaded(true);
            clearInterval(checkL);
          }
        }, 100);
      }
    } else {
      setLeafletLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    const L = window.L;
    if (!L) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    let defaultCenter = [18.605, 73.827];
    const segments = data?.route_segments || [];
    let allBounds = [];

    segments.forEach((seg) => {
      seg.waypoints.forEach((pt) => {
        allBounds.push([pt.latitude, pt.longitude]);
      });
    });

    if (allBounds.length > 0) {
      defaultCenter = allBounds[0];
    }

    const map = L.map(mapContainerRef.current).setView(defaultCenter, 13);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const colors = ["#0284c7", "#059669", "#7c3aed", "#d97706", "#dc2626"];

    // DRAW EACH ROUTE SEGMENT INDEPENDENTLY (PHYSICAL GAP REQUIREMENT)
    segments.forEach((seg, idx) => {
      const coords = seg.waypoints.map((pt) => [pt.latitude, pt.longitude]);
      if (coords.length > 0) {
        const segColor = colors[idx % colors.length];
        const isSelected = activeSegmentId === null || activeSegmentId === seg.segment_id;

        const polyline = L.polyline(coords, {
          color: segColor,
          weight: isSelected ? 5 : 2,
          opacity: isSelected ? 0.9 : 0.3,
        }).addTo(map);

        polyline.bindPopup(
          `<div style="font-size:12px;"><b>Segment #${seg.segment_id || idx + 1}</b><br/>Start: ${seg.start_time}<br/>End: ${seg.end_time}<br/>Points: ${seg.waypoints.length}</div>`
        );

        // Segment Start Marker
        L.circleMarker(coords[0], {
          radius: 5,
          fillColor: segColor,
          color: "#ffffff",
          weight: 2,
          fillOpacity: 1,
        }).addTo(map).bindPopup(`<b>Segment #${seg.segment_id || idx + 1} Start</b><br/>${seg.start_time}`);

        // Segment End Marker
        L.circleMarker(coords[coords.length - 1], {
          radius: 5,
          fillColor: segColor,
          color: "#000000",
          weight: 2,
          fillOpacity: 1,
        }).addTo(map).bindPopup(`<b>Segment #${seg.segment_id || idx + 1} End</b><br/>${seg.end_time}`);
      }
    });

    // Punch In / Punch Out Overarching Markers
    if (allBounds.length > 0) {
      const firstPt = allBounds[0];
      const lastPt = allBounds[allBounds.length - 1];

      L.marker(firstPt, {
        icon: L.divIcon({
          className: "custom-punch-in-icon",
          html: `<div style="background:#10b981;color:white;font-weight:bold;font-size:10px;padding:3px 6px;border-radius:6px;border:1px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);">PUNCH IN</div>`,
          iconSize: [60, 24],
          iconAnchor: [30, 12],
        }),
      }).addTo(map);

      L.marker(lastPt, {
        icon: L.divIcon({
          className: "custom-punch-out-icon",
          html: `<div style="background:#ef4444;color:white;font-weight:bold;font-size:10px;padding:3px 6px;border-radius:6px;border:1px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);">PUNCH OUT</div>`,
          iconSize: [70, 24],
          iconAnchor: [35, 12],
        }),
      }).addTo(map);
    }

    // Site Visit Sessions Markers
    if (data?.site_visit_sessions) {
      data.site_visit_sessions.forEach((visit) => {
        if (visit.latitude && visit.longitude) {
          L.circleMarker([visit.latitude, visit.longitude], {
            radius: 7,
            fillColor: "#6366f1",
            color: "#ffffff",
            weight: 2,
            fillOpacity: 0.9,
          }).addTo(map).bindPopup(`<b>Site Visit: ${visit.site_name || visit.site_id}</b><br/>Duration: ${visit.duration_minutes} mins`);
        }
      });
    }

    if (allBounds.length > 0) {
      map.fitBounds(allBounds, { padding: [40, 40] });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletLoaded, data, activeSegmentId]);

  // Handle Playback Marker Movement without synthetic line generation
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L || !currentPlaybackPos) return;
    const L = window.L;

    if (playbackMarkerRef.current) {
      playbackMarkerRef.current.setLatLng([currentPlaybackPos.latitude, currentPlaybackPos.longitude]);
    } else {
      playbackMarkerRef.current = L.marker([currentPlaybackPos.latitude, currentPlaybackPos.longitude], {
        icon: L.divIcon({
          className: "custom-playback-icon",
          html: `<div style="background:#0284c7;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px #0284c7;"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(mapInstanceRef.current);
    }
  }, [currentPlaybackPos]);

  return (
    <div className="relative w-full h-[420px] bg-slate-950 rounded-2xl overflow-hidden border border-border shadow-lg">
      {!leafletLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-slate-900/80">
          Loading Interactive Segmented Route Map...
        </div>
      )}
      <div ref={mapContainerRef} className="w-full h-full z-10" />
    </div>
  );
};

export default function TrackHistory() {
  const [searchParams] = useSearchParams();
  const initialEmpId = searchParams.get("employee_id") || "1";
  const initialDate = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [employeeId, setEmployeeId] = useState(initialEmpId);
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState(null);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackSegIdx, setPlaybackSegIdx] = useState(0);
  const [playbackPtIdx, setPlaybackPtIdx] = useState(0);

  const fetchHistory = async () => {
    if (!employeeId || !date) return;
    setLoading(true);
    setIsPlaying(false);
    setPlaybackSegIdx(0);
    setPlaybackPtIdx(0);

    try {
      const [res, violData] = await Promise.all([
        api.get("/gps/history", { params: { employee_id: employeeId, date } }),
        getDutyLocationViolations({ employee_oid: employeeId, date }),
      ]);
      if (res.data) {
        setData(res.data);
      }
      setViolations(violData || []);
    } catch (err) {
      console.error("Error fetching track history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Segment-aware Playback timer logic (NEVER draws across disabled gaps)
  useEffect(() => {
    if (!isPlaying || !data?.route_segments || data.route_segments.length === 0) return;

    const intervalMs = Math.max(100, 600 / playbackSpeed);
    const timer = setInterval(() => {
      const currentSeg = data.route_segments[playbackSegIdx];
      if (!currentSeg || !currentSeg.waypoints || currentSeg.waypoints.length === 0) {
        setIsPlaying(false);
        return;
      }

      if (playbackPtIdx < currentSeg.waypoints.length - 1) {
        setPlaybackPtIdx((prev) => prev + 1);
      } else {
        // End of current segment reached
        if (playbackSegIdx < data.route_segments.length - 1) {
          // Jump instantly to next segment across disabled gap without drawing synthetic connector line
          setPlaybackSegIdx((prev) => prev + 1);
          setPlaybackPtIdx(0);
        } else {
          // Playback finished
          setIsPlaying(false);
          setPlaybackSegIdx(0);
          setPlaybackPtIdx(0);
        }
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSegIdx, playbackPtIdx, playbackSpeed, data]);

  const currentPlaybackPos =
    data?.route_segments?.[playbackSegIdx]?.waypoints?.[playbackPtIdx] || null;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <Link to="/gps/live">
            <Button variant="outline" size="sm" className="h-9 w-9 p-0 rounded-xl">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <History className="h-5 w-5 text-sky-500" /> Segmented Track History Map
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Area Manager Track History — Immediate Enable/Disable Segmented Route Renderer
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Officer ID:</span>
            <Input
              type="number"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-24 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-36 h-9 text-xs"
            />
          </div>

          <Button onClick={fetchHistory} size="sm" className="h-9 text-xs px-4">
            Load Route
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-xs">Loading track history...</div>
      ) : data ? (
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">Total Distance</span>
                  <span className="text-xl font-bold text-foreground mt-1 block">
                    {data.total_distance_km} km
                  </span>
                </div>
                <Navigation className="h-8 w-8 text-emerald-500/20" />
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">Enabled Route Segments</span>
                  <span className="text-xl font-bold text-sky-500 mt-1 block">
                    {data.route_segments?.length || 0} segments
                  </span>
                </div>
                <Layers className="h-8 w-8 text-sky-500/20" />
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">GPS Waypoints Logged</span>
                  <span className="text-xl font-bold text-foreground mt-1 block">
                    {data.total_points || data.waypoints?.length || 0} fixes
                  </span>
                </div>
                <MapPin className="h-8 w-8 text-indigo-500/20" />
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">Site Visit Sessions</span>
                  <span className="text-xl font-bold text-foreground mt-1 block">
                    {data.site_visit_sessions?.length || 0} visits
                  </span>
                </div>
                <ShieldCheck className="h-8 w-8 text-amber-500/20" />
              </CardContent>
            </Card>
          </div>

          {/* Interactive Leaflet Segmented Map Container */}
          <Card className="border border-border shadow-md">
            <CardHeader className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-sky-500" /> Route Segment Map Visualizer
              </CardTitle>

              {/* Playback Controls */}
              {data.route_segments?.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="h-7 text-xs px-2.5 font-semibold"
                  >
                    {isPlaying ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                    {isPlaying ? "Pause" : "Play Route"}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsPlaying(false);
                      setPlaybackSegIdx(0);
                      setPlaybackPtIdx(0);
                    }}
                    className="h-7 w-7 p-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>

                  <div className="flex items-center gap-1 pl-2 border-l border-slate-300 dark:border-slate-700">
                    {[1, 2, 5].map((spd) => (
                      <Button
                        key={spd}
                        size="sm"
                        variant={playbackSpeed === spd ? "default" : "ghost"}
                        onClick={() => setPlaybackSpeed(spd)}
                        className="h-6 px-1.5 text-[10px] rounded"
                      >
                        {spd}x
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-3">
              <LeafletMap
                data={data}
                activeSegmentId={activeSegmentId}
                isPlaying={isPlaying}
                currentPlaybackPos={currentPlaybackPos}
              />
            </CardContent>
          </Card>

          {/* Enabled Route Segments & Disabled Interval Gaps List */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="p-4 border-b border-border bg-slate-50 dark:bg-slate-900/50">
              <CardTitle className="text-sm font-bold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sky-500" /> Enabled Route Segments & Disabled Gaps
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {data.route_segments?.length || 0} active enabled window(s)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!data.route_segments || data.route_segments.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No enabled Track History segments for this date.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.route_segments.map((seg, idx) => {
                    const isSelected = activeSegmentId === seg.segment_id;
                    const prevSeg = idx > 0 ? data.route_segments[idx - 1] : null;

                    return (
                      <div key={seg.segment_id || idx} className="space-y-0">
                        {/* Disabled Interval Gap Banner */}
                        {prevSeg && (
                          <div className="bg-amber-500/10 border-y border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-medium">
                            <span className="flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5" />
                              REAL ROUTE GAP — Track History Disabled Interval
                            </span>
                            <span className="font-mono text-[11px]">
                              {prevSeg.end_time} → {seg.start_time} (No Polyline Connection)
                            </span>
                          </div>
                        )}

                        <div
                          onClick={() => setActiveSegmentId(isSelected ? null : seg.segment_id)}
                          className={`p-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-muted/50 ${
                            isSelected ? "bg-sky-500/5 border-l-4 border-sky-500" : ""
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 text-[10px] font-bold">
                                SEGMENT #{seg.segment_id || idx + 1}
                              </Badge>
                              <span className="text-xs font-mono font-semibold text-foreground">
                                {seg.start_time} → {seg.end_time}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Waypoints: {seg.waypoints?.length || 0} fixes | Start: {seg.waypoints?.[0]?.latitude.toFixed(4)}, {seg.waypoints?.[0]?.longitude.toFixed(4)}
                            </p>
                          </div>

                          <div className="text-right">
                            <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              ENABLED
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Duty Location Violation Timeline Events */}
          <Card className="border border-amber-500/30 shadow-sm bg-amber-500/5">
            <CardHeader className="p-4 border-b border-amber-500/20 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" /> Duty Location Violation Events ({violations.length})
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">Timeline log only</span>
            </CardHeader>
            <CardContent className="p-0">
              {violations.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground italic">
                  No location violations recorded on this date.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {violations.map((v, idx) => {
                    const isUnresolved =
                      v.location_restored_at === null ||
                      v.location_restored_at === undefined ||
                      v.location_restored_at === "";
                    return (
                      <div key={v.oid || v.id || idx} className="p-4 space-y-2 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                              Location OFF
                            </Badge>
                            <span className="text-xs font-mono font-semibold text-foreground">
                              {v.location_off_at || v.created_at}
                            </span>
                          </div>
                          {isUnresolved ? (
                            <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                              Unresolved
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              Restored
                            </Badge>
                          )}
                        </div>

                        {v.location_restored_at && (
                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                Location RESTORED
                              </Badge>
                              <span className="font-mono text-foreground font-semibold">
                                {v.location_restored_at}
                              </span>
                            </div>
                            {v.duration && (
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                Duration: {v.duration} min
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deduplicated Site Visit Sessions */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="p-4 border-b border-border bg-slate-50 dark:bg-slate-900/50">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-500" /> Deduplicated Site Visit Sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.site_visit_sessions?.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No site visit sessions recorded on this date.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.site_visit_sessions.map((visit) => (
                    <div key={visit.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-sm">
                            {visit.site_name || `Site #${visit.site_id}`}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {visit.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-4">
                          <span>
                            Entry: {new Date(visit.start_time).toLocaleTimeString()}
                          </span>
                          <span>
                            Exit: {visit.end_time ? new Date(visit.end_time).toLocaleTimeString() : "Ongoing"}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold text-sky-600 dark:text-sky-400 block">
                          {visit.duration_minutes} min
                        </span>
                        <span className="text-[11px] text-muted-foreground">{visit.points_count} raw points</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* GPS Waypoints List */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="p-4 border-b border-border">
              <CardTitle className="text-sm font-bold text-foreground">
                Recorded Waypoints Trail ({data.points?.length || data.waypoints?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-96 overflow-y-auto divide-y divide-border">
              {(data.points || data.waypoints)?.map((pt, idx) => (
                <div key={idx} className="p-3 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground w-8">#{idx + 1}</span>
                    <span className="font-mono text-foreground">
                      {pt.latitude.toFixed(5)}, {pt.longitude.toFixed(5)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>Speed: {pt.speed ? `${(pt.speed * 3.6).toFixed(1)} km/h` : "0"}</span>
                    <span>Acc: {pt.accuracy ? `${pt.accuracy.toFixed(0)}m` : "N/A"}</span>
                    <span>{new Date(pt.recorded_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

