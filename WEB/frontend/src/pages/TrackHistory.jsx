import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { History, Calendar, MapPin, Navigation, ArrowLeft, Clock, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api from "@/services/api";

export default function TrackHistory() {
  const [searchParams] = useSearchParams();
  const initialEmpId = searchParams.get("employee_id") || "1";
  const initialDate = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [employeeId, setEmployeeId] = useState(initialEmpId);
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!employeeId || !date) return;
    setLoading(true);
    try {
      const res = await api.get("/gps/history", {
        params: { employee_id: employeeId, date },
      });
      if (res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error("Error fetching track history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

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
              <History className="h-5 w-5 text-sky-500" /> Track History & Path Log
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Historical GPS trajectory and deduplicated site visit sessions
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground font-medium block">Total Distance Traveled</span>
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
                  <span className="text-xs text-muted-foreground font-medium block">GPS Points Logged</span>
                  <span className="text-xl font-bold text-foreground mt-1 block">
                    {data.total_points} fixes
                  </span>
                </div>
                <MapPin className="h-8 w-8 text-sky-500/20" />
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
                <ShieldCheck className="h-8 w-8 text-indigo-500/20" />
              </CardContent>
            </Card>
          </div>

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
                Recorded Waypoints Trail ({data.points?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-96 overflow-y-auto divide-y divide-border">
              {data.points?.map((pt, idx) => (
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
